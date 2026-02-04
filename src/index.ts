import express from 'express';
import dotenv from 'dotenv';
import { requireAuth } from './middleware/auth';
import { getSystemMetrics } from './services/system';
import { getIpfsStats } from './services/ipfs';
import { getLastGcRun } from './services/gc-logs';
import { config } from './config';

// Load environment variables
dotenv.config();

const app = express();
const PORT = config.port;

// Middleware
app.use(express.json());

// Trust proxy for proper IP logging behind nginx
app.set('trust proxy', true);

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: '3speak-node-monitor',
  });
});

// Main stats endpoint (auth required)
app.get('/api/node-stats', requireAuth, async (req, res) => {
  try {
    console.log(`Stats request from ${req.ip}`);
    
    const [systemMetrics, newRepoStats, oldRepoStats, gcInfo] = await Promise.all([
      getSystemMetrics(),
      getIpfsStats(config.ipfs.newRepoPath, true),   // true = new repo, safe to do full stats
      getIpfsStats(config.ipfs.oldRepoPath, false),  // false = old repo, limited stats only
      getLastGcRun(),
    ]);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        system: systemMetrics,
        ipfs: {
          newRepo: newRepoStats,
          oldRepo: oldRepoStats,
        },
        gc: gcInfo,
      },
    });
  } catch (error: any) {
    console.error('Error fetching node stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

// Start server
app.listen(PORT, '127.0.0.1', () => {
  console.log('='.repeat(60));
  console.log('🚀 3Speak Node Monitor Service Started');
  console.log('='.repeat(60));
  console.log(`Port: ${PORT}`);
  console.log(`Health check: http://127.0.0.1:${PORT}/health`);
  console.log(`API endpoint: http://127.0.0.1:${PORT}/api/node-stats`);
  console.log('');
  console.log('Configuration:');
  console.log(`  New repo: ${config.ipfs.newRepoPath}`);
  console.log(`  Old repo: ${config.ipfs.oldRepoPath}`);
  console.log(`  GC log: ${config.gc.logPath}`);
  console.log(`  Disk mount: ${config.disk.mountPoint}`);
  console.log('');
  console.log('Monitoring flags:');
  console.log(`  New repo size: ${config.monitoring.newRepoSize}`);
  console.log(`  New repo blocks: ${config.monitoring.newRepoBlocks}`);
  console.log(`  New repo pins: ${config.monitoring.newRepoPins}`);
  console.log(`  Old repo size: ${config.monitoring.oldRepoSize}`);
  console.log(`  Old repo blocks: ${config.monitoring.oldRepoBlocks}`);
  console.log(`  Old repo pins: ${config.monitoring.oldRepoPins}`);
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
