import fs from 'fs';
import path from 'path';

import { Probot, ProbotOctokit } from 'probot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import zoilist from '../src/index';

const privateKey = fs.readFileSync(path.join(__dirname, 'fixtures/mock-cert.pem'), 'utf-8');

const MockWebClient = vi.hoisted(() => ({ chat: { postMessage: vi.fn() } }));

vi.mock('@slack/web-api', () => ({ WebClient: vi.fn(() => MockWebClient) }));

describe('New PR Slack Notifications', () => {
  let probot: Probot;

  beforeEach(() => {
    probot = new Probot({
      appId: 123,
      privateKey,
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });

    MockWebClient.chat.postMessage.mockClear();

    probot.load(zoilist);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('when the `api-review/requested` label is added', () => {
    it('posts to slack', async () => {
      vi.useFakeTimers().setSystemTime(new Date('2023-11-11'));
      const payload = require('./fixtures/pull_request.labeled.semver_minor.json');

      await probot.receive({ name: 'pull_request', payload, id: 'abc123' });

      expect(MockWebClient.chat.postMessage).toHaveBeenCalledWith({
        channel: '#wg-api',
        unfurl_links: false,
        text:
          `Hey <!subteam^SNSJW1BA9>! Just letting you know that the following PR needs API review:\n` +
          '*<https://github.com/electron/electron/pull/38982|feat: add `BrowserWindow.isOccluded()` (#38982)>*',
      });
    });

    it('does not @mention anyone in the month of December', async () => {
      vi.useFakeTimers().setSystemTime(new Date('2023-12-25'));
      const payload = require('./fixtures/pull_request.labeled.semver_minor.json');

      await probot.receive({ name: 'pull_request', payload, id: 'abc123' });

      expect(MockWebClient.chat.postMessage).toHaveBeenCalledWith({
        channel: '#wg-api',
        unfurl_links: false,
        text:
          `Hey API WG! Just letting you know that the following PR needs API review:\n` +
          '*<https://github.com/electron/electron/pull/38982|feat: add `BrowserWindow.isOccluded()` (#38982)>*',
      });
    });
  });

  it('does not post to slack when a new semver-patch PR is opened', async () => {
    const payload = require('./fixtures/pull_request.labeled.semver_patch.json');

    await probot.receive({ name: 'pull_request', payload, id: 'abc123' });

    expect(MockWebClient.chat.postMessage).not.toHaveBeenCalled();
  });

  it('posts to slack when a draft PR is marked ready for review', async () => {
    const payload = require('./fixtures/pull_request.ready_for_review.json');

    await probot.receive({ name: 'pull_request', payload, id: 'abc123' });

    expect(MockWebClient.chat.postMessage).toHaveBeenCalled();
  });
});
