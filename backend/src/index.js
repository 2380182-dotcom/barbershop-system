import { createApp } from './app.js';
import { config } from './config.js';
import { startWorkers } from './workers/index.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Barber backend listening on port ${config.port}`);
  startWorkers();
});
