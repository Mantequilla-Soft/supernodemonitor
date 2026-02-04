import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  secretKey: process.env.SECRET_KEY || '',
  
  ipfs: {
    newRepoPath: process.env.IPFS_NEW_PATH || '/pool0/ipfs/.ipfs-new',
    oldRepoPath: process.env.IPFS_OLD_PATH || '/pool0/ipfs/.ipfs',
  },
  
  monitoring: {
    newRepoSize: process.env.MONITOR_NEW_REPO_SIZE === 'true',
    newRepoBlocks: process.env.MONITOR_NEW_REPO_BLOCKS === 'true',
    newRepoPins: process.env.MONITOR_NEW_REPO_PINS === 'true',
    oldRepoSize: process.env.MONITOR_OLD_REPO_SIZE === 'true',
    oldRepoBlocks: process.env.MONITOR_OLD_REPO_BLOCKS === 'true',
    oldRepoPins: process.env.MONITOR_OLD_REPO_PINS === 'true',
  },
  
  gc: {
    logPath: process.env.GC_LOG_PATH || '/var/log/ipfs-gc-new.log',
  },
  
  disk: {
    mountPoint: process.env.DISK_MOUNT || '/pool0',
  },
};

// Validate critical configuration
if (!config.secretKey) {
  console.error('ERROR: SECRET_KEY not set in environment');
  console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

// Warn about dangerous settings
if (config.monitoring.oldRepoSize || config.monitoring.oldRepoBlocks) {
  console.error('⚠️  WARNING: Old repo size/block monitoring is ENABLED');
  console.error('⚠️  This will cause massive RAM usage (120GB+) on large repos!');
  console.error('⚠️  Set MONITOR_OLD_REPO_SIZE=false and MONITOR_OLD_REPO_BLOCKS=false');
}
