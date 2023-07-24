import fs from 'fs';
import path from 'path';

import { Probot, ProbotOctokit } from 'probot';

import { MockWebClient, MockedWebClient } from '@slack-wrench/jest-mock-web-client';

import zoilist from '../src/index';

const privateKey = fs.readFileSync(path.join(__dirname, 'fixtures/mock-cert.pem'), 'utf-8');

describe('New PR Slack Notifications', () => {
  let probot: Probot;
  let client: MockWebClient;

  beforeEach(() => {
    probot = new Probot({
      appId: 123,
      privateKey,
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });

    client = MockedWebClient.mock.instances[0];
    client.chat.postMessage = jest.fn();

    probot.load(zoilist);
  });

  it('posts to slack when the api-review/requested label is added', async () => {
    const payload = require('./fixtures/pull_request.labeled.semver_minor.json');

    await probot.receive({ name: 'pull_request', payload, id: 'abc123' });

    expect(client.chat.postMessage).toHaveBeenCalledWith({
      channel: '#wg-api',
      unfurl_links: false,
      text:
        `Hey <!subteam^SNSJW1BA9>! Just letting you know that the following PR needs API review:\n` +
        '*<https://github.com/electron/electron/pull/38982|feat: add `BrowserWindow.isOccluded()` (#38982)>*',
    });
  });

  it('does not post to slack when a new semver-patch PR is opened', async () => {
    const payload = require('./fixtures/pull_request.labeled.semver_patch.json');

    await probot.receive({ name: 'pull_request', payload, id: 'abc123' });

    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });
});
