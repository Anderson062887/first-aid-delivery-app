module.exports = {
  apps: [{
    name: 'first-aid-server',
    script: 'src/index.js',
    cwd: '/var/www/ic/server',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: '/var/log/pm2/first-aid-error.log',
    out_file: '/var/log/pm2/first-aid-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
