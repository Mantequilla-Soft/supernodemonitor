import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config';

const execAsync = promisify(exec);

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
}

export async function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  // Get disk usage for configured mount point (e.g., /pool0)
  let diskStats = null;
  try {
    const { stdout } = await execAsync(`df -B1 ${config.disk.mountPoint} | tail -1`);
    const parts = stdout.trim().split(/\s+/);
    
    if (parts.length >= 4) {
      const total = parseInt(parts[1]);
      const used = parseInt(parts[2]);
      const available = parseInt(parts[3]);
      
      diskStats = {
        path: config.disk.mountPoint,
        totalTB: (total / (1024 ** 4)).toFixed(1),
        usedTB: (used / (1024 ** 4)).toFixed(1),
        freeTB: (available / (1024 ** 4)).toFixed(1),
        percentUsed: Math.round((used / total) * 100),
      };
    }
  } catch (error: any) {
    console.error('Error getting disk stats:', error.message);
    diskStats = {
      path: config.disk.mountPoint,
      error: error.message,
    };
  }
  
  return {
    hostname: os.hostname(),
    uptime: Math.floor(os.uptime()),
    uptimeHuman: formatUptime(os.uptime()),
    memory: {
      totalGB: Math.round(totalMem / (1024 ** 3)),
      usedGB: Math.round(usedMem / (1024 ** 3)),
      freeGB: Math.round(freeMem / (1024 ** 3)),
      percentUsed: Math.round((usedMem / totalMem) * 100),
    },
    disk: diskStats,
    loadAverage: os.loadavg().map(v => parseFloat(v.toFixed(2))),
  };
}
