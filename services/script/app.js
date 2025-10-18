import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "#shared/r2-client.js";
import express from 'express';
import composeRouter from './routes/compose.js'; // Adjust if your path is different

const app = express();
const PORT = process.env.PORT || 8080;

// 1. Body parser middleware for JSON (MUST be before routes)
app.use(express.json());

// Optional: Log incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} Body:`, req.body);
  next();
});

// 2. Register the /compose router
app.use('/compose', composeRouter);

// 3. Health check endpoint
app.get('/', (req, res) => {
  res.send('Podcast Script Generation API running!');
});

// 4. Listen for connections
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

export default app;
