import crypto from 'crypto';
import { validateWebhookSignature } from './githubService';

describe('GitHub webhook signature', () => {
  it('accepts a valid sha256 signature and rejects an invalid one', async () => {
    const payload = '{"action":"push"}';
    const secret = 'webhook-secret';
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
    await expect(validateWebhookSignature(payload, signature, secret)).resolves.toBe(true);
    await expect(validateWebhookSignature(payload, 'sha256=bad', secret)).resolves.toBe(false);
  });
});
