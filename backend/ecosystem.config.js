module.exports = {
  apps: [
    {
      name: 'frameseek-api',
      script: 'venv/bin/uvicorn',
      args: 'app.main:app --host 0.0.0.0 --port 8000 --workers 4',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        PATH: `${__dirname}/venv/bin:${process.env.PATH}`,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'frameseek-worker',
      script: 'venv/bin/arq',
      args: 'app.workers.worker.WorkerSettings',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        PATH: `${__dirname}/venv/bin:${process.env.PATH}`,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
