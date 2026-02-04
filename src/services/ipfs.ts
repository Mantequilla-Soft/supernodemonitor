import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config';

const execAsync = promisify(exec);

interface IpfsStats {
  path: string;
  sizeGB?: string | null;
  sizeTB?: string | null;
  blockCount?: number | null;
  pinCount?: number | null;
  daemonRunning: boolean;
  version?: string | null;
  peerCount?: number | null;
  error?: string;
}

export async function getIpfsStats(repoPath: string, isNewRepo: boolean): Promise<IpfsStats> {
  try {
    const env = `IPFS_PATH=${repoPath}`;
    
    // Check if daemon is running first
    let daemonRunning = false;
    try {
      const { stdout: idOutput } = await execAsync(
        `${env} ipfs id 2>/dev/null`,
        { timeout: 5000 }
      );
      daemonRunning = idOutput && !idOutput.includes('ERROR');
    } catch (e) {
      daemonRunning = false;
    }
    
    let sizeBytes: number | null = null;
    let blockCount: number | null = null;
    
    // ⚠️ ONLY gather size/block stats for NEW repo
    // Old repo (81.6TB) will kill the server with these commands
    if (isNewRepo && config.monitoring.newRepoSize) {
      try {
        const { stdout: duOutput } = await execAsync(
          `du -sb ${repoPath}/blocks 2>/dev/null | awk '{print $1}'`,
          { timeout: 30000 }
        );
        const parsed = parseInt(duOutput.trim());
        if (!isNaN(parsed)) {
          sizeBytes = parsed;
        }
      } catch (error: any) {
        console.error(`Error getting size for ${repoPath}:`, error.message);
      }
      
      // Fast approximation for new repo
      if (config.monitoring.newRepoBlocks) {
        try {
          const { stdout: blockCountOutput } = await execAsync(
            `find ${repoPath}/blocks -type f 2>/dev/null | wc -l`,
            { timeout: 30000 }
          );
          const parsed = parseInt(blockCountOutput.trim());
          if (!isNaN(parsed)) {
            blockCount = parsed;
          }
        } catch (error: any) {
          console.error(`Error getting block count for ${repoPath}:`, error.message);
        }
      }
    } else if (!isNewRepo && config.monitoring.oldRepoSize) {
      // For old repo: use IPFS daemon's cached stats (if available)
      if (daemonRunning) {
        try {
          const { stdout: repoStats } = await execAsync(
            `${env} ipfs stats repo --human 2>/dev/null`,
            { timeout: 10000 }
          );
          if (repoStats && !repoStats.includes('ERROR')) {
            // Parse size from "RepoSize: 81.6 TB"
            const sizeMatch = repoStats.match(/RepoSize:\s*(\d+\.?\d*)\s*(GB|TB)/i);
            if (sizeMatch) {
              const value = parseFloat(sizeMatch[1]);
              const unit = sizeMatch[2].toUpperCase();
              sizeBytes = unit === 'TB' ? value * (1024 ** 4) : value * (1024 ** 3);
            }
          }
        } catch (e) {
          // Daemon stats failed, leave as null
        }
      }
    }
    
    // Pin count is SAFE for both repos (daemon API, not filesystem)
    let pinCount: number | null = null;
    if (daemonRunning) {
      const shouldMonitorPins = isNewRepo 
        ? config.monitoring.newRepoPins 
        : config.monitoring.oldRepoPins;
        
      if (shouldMonitorPins) {
        try {
          const { stdout: pinOutput } = await execAsync(
            `${env} ipfs pin ls --type=recursive 2>/dev/null | wc -l`,
            { timeout: 60000 }
          );
          const parsed = parseInt(pinOutput.trim());
          if (!isNaN(parsed)) {
            pinCount = parsed;
          }
        } catch (error: any) {
          console.error(`Error getting pin count for ${repoPath}:`, error.message);
        }
      }
    }
    
    // Get version and peer count if daemon is running
    let version: string | null = null;
    let peerCount: number | null = null;
    if (daemonRunning) {
      try {
        const { stdout: versionOutput } = await execAsync(
          `${env} ipfs version --number 2>/dev/null`,
          { timeout: 5000 }
        );
        version = versionOutput.trim();
      } catch (e) {
        // Version check failed
      }
      
      try {
        const { stdout: peersOutput } = await execAsync(
          `${env} ipfs swarm peers 2>/dev/null | wc -l`,
          { timeout: 10000 }
        );
        const parsed = parseInt(peersOutput.trim());
        if (!isNaN(parsed)) {
          peerCount = parsed;
        }
      } catch (e) {
        // Peer count failed
      }
    }
    
    return {
      path: repoPath,
      sizeGB: sizeBytes && sizeBytes < 1024 ** 4 
        ? (sizeBytes / (1024 ** 3)).toFixed(1)
        : null,
      sizeTB: sizeBytes && sizeBytes >= 1024 ** 4
        ? (sizeBytes / (1024 ** 4)).toFixed(1)
        : null,
      blockCount,
      pinCount,
      daemonRunning,
      version,
      peerCount,
    };
  } catch (error: any) {
    return {
      path: repoPath,
      daemonRunning: false,
      error: error.message,
    };
  }
}
