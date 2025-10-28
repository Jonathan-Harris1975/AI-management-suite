// services/script/app.js

import express from 'express';
import createScriptRoute from './routes/createScript.js';

const app = express();
app.use(express.json());

app.use('/script', createScriptRoute);

export default app;