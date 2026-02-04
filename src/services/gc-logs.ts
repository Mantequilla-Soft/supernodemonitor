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
    // Expected format:
    // 2026-02-04 03:00:00 Starting GC...
    // removed 945 blocks
    // 2026-02-04 03:02:14 GC complete
    
    const lastLines = lines.slice(-20); // Last 20 lines
    const startMatch = lastLines.find(l => l.includes('Starting GC') || l.includes('starting gc'));
    const blocksMatch = lastLines.find(l => l.match(/removed\s+\d+\s+blocks?/i));
    const endMatch = lastLines.find(l => l.includes('GC complete') || l.includes('gc complete'));
    
    if (!startMatch || !endMatch) {
      return {
        lastRun: null,
        status: 'No completed GC run found in logs',
        logPath: gcLogPath,
      };
    }
    
    // Try to parse timestamp from start of line (format: YYYY-MM-DD HH:MM:SS)
    const parseTimestamp = (line: string): Date | null => {
      const match = line.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
      if (match) {
        try {
          return parseISO(`${match[1]}T${match[2]}`);
        } catch (e) {
          return null;
        }
      }
      return null;
    };
    
    const startTime = parseTimestamp(startMatch);
    const endTime = parseTimestamp(endMatch);
    
    if (!startTime || !endTime) {
      return {
        lastRun: null,
        status: 'Unable to parse timestamps from GC logs',
        logPath: gcLogPath,
      };
    }
    
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    
    const blocksRemoved = blocksMatch 
      ? parseInt(blocksMatch.match(/removed\s+(\d+)\s+blocks?/i)?.[1] || '0')
      : 0;
    
    // Calculate next scheduled run (3 AM next day)
    const nextRun = new Date(startTime);
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(3, 0, 0, 0);
    
    return {
      lastRun: startTime.toISOString(),
      lastRunHuman: formatDistanceToNow(startTime, { addSuffix: true }),
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
