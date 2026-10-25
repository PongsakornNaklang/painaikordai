// Run: node server.mjs   → http://localhost:3000
import { createServer } from 'node:http';
import handler from './app.mjs';

const PORT = process.env.PORT || 3000;
createServer(handler).listen(PORT, () => console.log('http://localhost:' + PORT));
