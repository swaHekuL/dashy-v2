import { spawn } from 'child_process';

export default function handler(req, res) {
  const { CAMERA_IP, CAMERA_USER, CAMERA_PASS } = process.env;

  if (!CAMERA_IP || !CAMERA_USER || !CAMERA_PASS) {
    res.status(503).end('Camera not configured');
    return;
  }

  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=ffmpeg');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'close');

  const rtspUrl = `rtsp://${CAMERA_USER}:${CAMERA_PASS}@${CAMERA_IP}/stream2`;

  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-vf', 'scale=800:-2',
    '-f', 'mpjpeg',
    '-q:v', '5',
    '-r', '10',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  ffmpeg.stdout.pipe(res);
  req.socket.on('close', () => ffmpeg.kill('SIGTERM'));
  ffmpeg.on('error', () => res.end());
}
