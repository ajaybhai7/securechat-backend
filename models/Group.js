const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // To handle End-to-End Encryption in a group of unlimited size:
  groupPublicKey: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
