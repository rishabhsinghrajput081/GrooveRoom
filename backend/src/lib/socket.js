import { Server } from "socket.io";
import { Message } from "../models/message.model.js";

export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:3000",
      credentials: true,
    },
  });

  const userSockets = new Map(); // { userId: socketId }
  const userActivities = new Map(); // { userId: activity }

  io.on("connection", (socket) => {
    console.log(`New connection: ${socket.id}`);

    // When a user connects
    socket.on("user_connected", (userId) => {
      userSockets.set(userId, socket.id);
      userActivities.set(userId, "Idle");

      console.log(`User connected: ${userId} -> ${socket.id}`);
      
      // Notify only other users of the new connection
      socket.broadcast.emit("user_connected", userId);

      // Send the list of online users and activities to the newly connected user
      socket.emit("users_online", Array.from(userSockets.keys()));
      socket.emit("activities", Array.from(userActivities.entries()));
    });

    // Update user activity
    socket.on("update_activity", ({ userId, activity }) => {
      console.log(`Activity updated for user ${userId}: ${activity}`);
      userActivities.set(userId, activity);

      // Notify all users of the updated activity
      io.emit("activity_updated", { userId, activity });
    });

    // Sending messages
    socket.on("send_message", async (data) => {
      try {
        const { senderId, receiverId, content } = data;
        console.log(`Message from ${senderId} to ${receiverId}: ${content}`);

        // Save message in the database
        const message = await Message.create({
          senderId,
          receiverId,
          content,
        });

        // Send to the receiver if they're online
        const receiverSocketId = userSockets.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("receive_message", message);
        } else {
          console.log(`User ${receiverId} is offline.`);
        }

        // Notify the sender of successful message sending
        socket.emit("message_sent", message);
      } catch (error) {
        console.error("Message error:", error);
        socket.emit("message_error", error.message);
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      let disconnectedUserId;
      for (const [userId, socketId] of userSockets.entries()) {
        if (socketId === socket.id) {
          disconnectedUserId = userId;
          userSockets.delete(userId);
          userActivities.delete(userId);
          break;
        }
      }

      if (disconnectedUserId) {
        console.log(`User disconnected: ${disconnectedUserId}`);
        // Notify all other users
        io.emit("user_disconnected", disconnectedUserId);
      } else {
        console.log(`Socket ${socket.id} disconnected but no user matched.`);
      }
    });
  });
};
