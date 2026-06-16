const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // for 1-to-1
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' }, // for Unlimited Groups
  encryptedContent: { type: String, required: true }, // The E2E Encrypted Payload
  messageType: { type: String, enum: ['text', 'image', 'file', 'video'], default: 'text' },
  fileUrl: { type: String }, // Used if it's a file
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
