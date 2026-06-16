const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// ─── SIMPLE FILE DATABASE ──────────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], groups: [], messages: [] }));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

let db = loadDB();
// socketId is runtime only, not persisted
let onlineSockets = {}; // { username: socketId }
// ─────────────────────────────────────────────────────────────────────────────

// ─── HELPER ──────────────────────────────────────────────────────────────────
function broadcastUsers() {
  io.emit('users_list', db.users.map(u => ({
    username: u.username,
    publicKey: u.publicKey,
    online: !!onlineSockets[u.username],
    bio: u.bio,
    avatar: u.avatar
  })));
}

function broadcastGroups() {
  io.emit('groups_list', db.groups);
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { username, password, publicKey, inviteGroup } = req.body;
  if (db.users.find(u => u.username === username))
    return res.status(400).json({ error: 'User already exists!' });

  db.users.push({
    username,
    password,
    publicKey,
    bio: 'Hey! I am using SecureChat.',
    avatar: ''
  });

  if (inviteGroup) {
    const g = db.groups.find(g => g.id === inviteGroup);
    if (g && !g.members.includes(username)) g.members.push(username);
  }

  saveDB(db);
  console.log(`✅ New user registered: ${username}`);
  res.json({ message: 'Registered successfully!' });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid username or password!' });
  res.json({ message: 'Login successful' });
});

// ─── PROFILE ────────────────────────────────────────────────────────────────
app.post('/api/profile/edit', (req, res) => {
  const { username, bio, avatar } = req.body;
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (bio !== undefined) user.bio = bio;
  if (avatar !== undefined) user.avatar = avatar;
  saveDB(db);
  broadcastUsers();
  res.json({ message: 'Profile updated!' });
});

// ─── GROUPS ─────────────────────────────────────────────────────────────────
app.post('/api/groups/create', (req, res) => {
  const { name, creator, members } = req.body;
  const groupId = 'group_' + Date.now();
  db.groups.push({ id: groupId, name, members: [creator, ...members], createdBy: creator });
  saveDB(db);
  broadcastGroups();
  res.json({ message: 'Group created!', groupId });
});

// ─── SEARCH ──────────────────────────────────────────────────────────────────
app.get('/api/users/search', (req, res) => {
  const { username } = req.query;
  const found = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!found) return res.status(404).json({ error: 'User not found' });
  res.json({
    username: found.username,
    publicKey: found.publicKey,
    online: !!onlineSockets[found.username],
    bio: found.bio
  });
});

// ─── SOCKET.IO ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on('user_login', (username) => {
    onlineSockets[username] = socket.id;
    broadcastUsers();
    broadcastGroups();
    console.log(`👤 ${username} is online`);
  });

  socket.on('send_message', (data) => {
    // data: { sender, receiver, encryptedContent, isFile, fileName, isAudio, isGroup, timestamp }
    const msg = { ...data, timestamp: new Date() };
    db.messages.push(msg);
    saveDB(db);

    if (data.isGroup) {
      const g = db.groups.find(grp => grp.id === data.receiver);
      if (g) {
        g.members.forEach(member => {
          if (member !== data.sender && onlineSockets[member]) {
            io.to(onlineSockets[member]).emit('receive_message', msg);
          }
        });
      }
    } else {
      const receiverSocketId = onlineSockets[data.receiver];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', msg);
      }
    }
  });

  // WebRTC Signaling
  socket.on('call_user', (data) => {
    const targetSocket = onlineSockets[data.userToCall];
    if (targetSocket) io.to(targetSocket).emit('call_incoming', { signal: data.signalData, from: data.from, isVideo: data.isVideo });
  });

  socket.on('answer_call', (data) => {
    const targetSocket = onlineSockets[data.to];
    if (targetSocket) io.to(targetSocket).emit('call_accepted', data.signal);
  });

  socket.on('disconnect', () => {
    const username = Object.keys(onlineSockets).find(u => onlineSockets[u] === socket.id);
    if (username) {
      delete onlineSockets[username];
      broadcastUsers();
      console.log(`❌ ${username} went offline`);
    }
  });
});

// ─── START ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 SecureChat Backend running on port ${PORT}`);
});
