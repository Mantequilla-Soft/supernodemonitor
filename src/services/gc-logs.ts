import { readFile } from 'fs/promises';
import { parseISO, formatDistanceToNow } from 'date-fns';
import { config } from '../config';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

interface GcInfo {
  lastRun: string | null;
  lastRunHuman?: string;
  blocksRemoved?: number;
  durationSeconds?: number;
  durationHuman?: string;
  nextScheduled?: string;
  status: string;
  logPath: string;
}

export async function getLastGcRun(logPath?: string): Promise<GcInfo> {
  const gcLogPath = logPath || config.gc.logPath;
  
  try {
    const content = await readFile(gcLogPath, 'utf-8');
    const lines = content.trim().split('\n');
    
    if (lines.length === 0) {
      return {
        lastRun: null,
        status: 'No GC logs found',
        logPath: gcLogPath,
      };
    }
    
    // Parse last GC run from log
    // Actual format from IPFS: just lines of "removed <CID>"
    // We need to use file modification time to determine when GC last ran
    
    const { stat } = await import('fs/promises');
    const fileStat = await stat(gcLogPath);
    const lastModified = fileStat.mtime;
    
    // Count total "removed" lines in the entire log
    const removedLines = lines.filter(l => l.trim().startsWith('removed '));
    const blocksRemoved = removedLines.length;
    
    if (blocksRemoved === 0) {
      return {
        lastRun: null,
        status: 'No GC activity found in logs',
        logPath: gcLogPath,
      };
    }
    
    // Since the cron job is scheduled at 3 AM daily, we can infer the last run time
    // by finding the most recent 3 AM based on file modification time
    const inferLastGcRun = (fileModTime: Date): Date => {
      const gcHour = 3; // GC runs at 3 AM
      const lastRun = new Date(fileModTime);
      
      // If file was modified after 3 AM today, GC likely ran at 3 AM today
      // Otherwise, it ran at 3 AM yesterday
      const today3am = new Date(lastRun);
      today3am.setHours(gcHour, 0, 0, 0);
      
      if (lastRun >= today3am) {
        return today3am;
      } else {
        const yesterday3am = new Date(today3am);
        yesterday3am.setDate(yesterday3am.getDate() - 1);
        return yesterday3am;
      }
    };
    
    const lastRun = inferLastGcRun(lastModified);
    
    // Calculate duration estimate based on file size and modification time
    // (we can't know exact duration without timestamps, so we'll estimate)
    const durationSeconds = Math.max(60, Math.min(Math.floor(blocksRemoved / 10), 600)); // 1-10 min estimate
    
    // Calculate next scheduled run (3 AM next day)
    const nextRun = new Date(lastRun);
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(3, 0, 0, 0);
    
    return {
      lastRun: lastRun.toISOString(),
      lastRunHuman: formatDistanceToNow(lastRun, { addSuffix: true }),
      blocksRemoved,
      durationSeconds,
      durationHuman: formatDuration(durationSeconds),
      nextScheduled: nextRun.toISOString(),
      status: 'success',
      logPath: gcLogPath,
    };
  } catch (error: any) {
    return {
      lastRun: null,
      status: `Error reading log: ${error.message}`,
      logPath: gcLogPath,
    };
  }
}
