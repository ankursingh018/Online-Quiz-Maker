const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// MongoDB connection setup
const MONGO_URL = 'mongodb://localhost:27017'; // Change if your MongoDB is remote
const DB_NAME = 'quizdb';
const COLLECTION = 'quiz-data';
const USERS_COLLECTION = 'users';
const JWT_SECRET = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'; // Change this to a strong secret in production

let db, quizzesCollection, usersCollection;

MongoClient.connect(MONGO_URL, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(DB_NAME);
    quizzesCollection = db.collection(COLLECTION); // This will now be 'quiz-data'
    usersCollection = db.collection(USERS_COLLECTION);
    app.listen(PORT, () => {
      console.log(`Quiz backend running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  const existing = await usersCollection.findOne({ username });
  if (existing) {
    return res.status(409).json({ error: 'Username already exists.' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  await usersCollection.insertOne({ username, password: hashedPassword });
  res.json({ success: true, message: 'Signup successful.' });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  const user = await usersCollection.findOne({ username });
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  // Generate JWT token
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ success: true, token });
});

// Create quiz (store in MongoDB)
app.post('/api/quizzes', async (req, res) => {
  const quizData = req.body;
  // Find the highest code in the collection
  const lastQuiz = await quizzesCollection
    .find({})
    .sort({ code: -1 })
    .limit(1)
    .toArray();
  let nextCode = 111;
  if (lastQuiz.length > 0 && !isNaN(Number(lastQuiz[0].code))) {
    nextCode = Number(lastQuiz[0].code) + 1;
  }
  quizData.code = String(nextCode);
  await quizzesCollection.insertOne(quizData);
  res.json({ success: true, code: quizData.code });
});

// Get quiz by code
app.get('/api/quizzes/:code', async (req, res) => {
  const code = req.params.code;
  const quiz = await quizzesCollection.findOne({ code });
  if (quiz) {
    res.json(quiz);
  } else {
    res.status(404).json({ error: 'Quiz not found' });
  }
});

// Get all quizzes (with pagination)
app.get('/api/quizzes', async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const quizzes = await quizzesCollection
    .find({})
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .toArray();
  const total = await quizzesCollection.countDocuments();
  res.json({ quizzes, total, page: Number(page), lastPage: Math.ceil(total / limit) });
});

// Update a quiz by code
app.put('/api/quizzes/:code', async (req, res) => {
  const code = req.params.code;
  const updateData = req.body;
  const result = await quizzesCollection.updateOne({ code }, { $set: updateData });
  if (result.modifiedCount === 1) {
    res.json({ success: true, message: 'Quiz updated.' });
  } else {
    res.status(404).json({ error: 'Quiz not found' });
  }
});

// Delete a quiz by code
app.delete('/api/quizzes/:code', async (req, res) => {
  const code = req.params.code;
  const result = await quizzesCollection.deleteOne({ code });
  if (result.deletedCount === 1) {
    res.json({ success: true, message: 'Quiz deleted.' });
  } else {
    res.status(404).json({ error: 'Quiz not found' });
  }
});

// Submit quiz result
app.post('/api/quiz-result', async (req, res) => {
  let { code, name, score, total, timestamp } = req.body;
  if (!code || !name || score === undefined || !total) {
    return res.status(400).json({ error: 'Missing data' });
  }
  // Normalize code and name to avoid mismatches
  code = code.trim().toLowerCase();
  name = name.trim().toLowerCase();
  await db.collection('quiz-results').insertOne({ code, name, score, total, timestamp });
  console.log(`Inserted quiz result for code: ${code}, name: ${name}, score: ${score}`);
  res.json({ success: true });
});

// Get quiz result for a user
app.get('/api/quiz-result', async (req, res) => {
  let { code, name } = req.query;
  if (!code || !name) return res.status(400).json({ error: 'Missing code or name' });
  // Normalize code and name to avoid mismatches
  code = code.trim().toLowerCase();
  name = name.trim().toLowerCase();
  const result = await db.collection('quiz-results').findOne({ code, name });
  if (!result) return res.status(404).json({ error: 'Result not found' });
  res.json(result);
});

app.get('/api/all-quiz-results', async (req, res) => {
  let { code } = req.query;
  let filter = {};
  if (code) {
    filter.code = code.trim().toLowerCase();
  }
  const results = await db.collection('quiz-results').find(filter).toArray();
  res.json(results);
});


