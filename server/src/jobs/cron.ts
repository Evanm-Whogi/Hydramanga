// src/jobs/cron.ts
import cron from 'node-cron';
import { queueService } from '@/services/queueService';
import path from 'path';


// Disabled for now
export const initCronJobs = () => {
  // Every 3 days at midnight: 0 0 */3 * *
//   cron.schedule('0 0 */3 * *', async () => {
//     console.log('[CRON] Triggering Manga Sync Job');
//     const filePath = path.resolve(__dirname, '../../data/manga.json');
    
//     await queueService.addJob('mangaImportQueue', 'fullSync', { 
//       filePath 
//     });
//   });
};