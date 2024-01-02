import { Probot } from 'probot';
import { PullRequest } from '@octokit/webhooks-types';
import { WebClient } from '@slack/web-api';
import { isQuietPeriod } from './util';

const API_REVIEW_REQUESTED_LABEL_ID = 1603621692; // api-review/requested
const { SLACK_BOT_TOKEN, NODE_ENV } = process.env;

if (!SLACK_BOT_TOKEN && NODE_ENV !== 'test') {
  console.error('Missing environment variable SLACK_BOT_TOKEN');
  process.exit(1);
}

const slack = new WebClient(SLACK_BOT_TOKEN);

/**
 * Posts a message to Slack notifying the API WG that a PR needs review.
 * @param pr The PR to post to Slack
 */
async function postToSlack(pr: PullRequest) {
  const escapedTitle = pr.title.replace(
    /[&<>]/g,
    (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x]!,
  );
  const name = isQuietPeriod() ? 'API WG' : '<!subteam^SNSJW1BA9>';
  await slack.chat.postMessage({
    channel: '#wg-api',
    unfurl_links: false,
    text:
      `Hey ${name}! Just letting you know that the following PR needs API review:\n` +
      `*<${pr._links.html.href}|${escapedTitle} (#${pr.number})>*`,
  });
}

// We want to notify the API WG if a PR is labeled with the API review label and is ready for review.
// If a PR is already labeled with the API review label, it won't trigger a notification, so we want to
// notify the API WG when it becomes ready for review.
export = (app: Probot) => {
  app.on('pull_request.labeled', async ({ payload }) => {
    const { pull_request: pr, label } = payload;

    if (label?.id === API_REVIEW_REQUESTED_LABEL_ID) {
      await postToSlack(pr);
    }
  });

  app.on('pull_request.ready_for_review', async ({ payload }) => {
    const { pull_request: pr } = payload;

    if (pr.labels.some(({ id }) => id === API_REVIEW_REQUESTED_LABEL_ID)) {
      await postToSlack(pr);
    }
  });
};
