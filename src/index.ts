import { Probot } from 'probot';
import { EventPayloads } from '@octokit/webhooks';
import { WebClient } from '@slack/web-api';

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
async function postToSlack(pr: EventPayloads.WebhookPayloadPullRequestPullRequest) {
  const escapedTitle = pr.title.replace(
    /[&<>]/g,
    (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x]!,
  );
  await slack.chat.postMessage({
    channel: '#wg-api',
    unfurl_links: false,
    text:
      `Hey <!subteam^SNSJW1BA9>! Just letting you know that the following PR needs API review:\n` +
      `*<${pr._links.html.href}|${escapedTitle} (#${pr.number})>*`,
  });
}

// We want to notify the API WG if a PR is labeled with the API review label and is ready for review.
// If a PR is already labeled with the API review label, it won't trigger a notification, so we want to
// notify the API WG when it becomes ready for review.
export = (app: Probot) => {
  app.on(['pull_request.labeled', 'pull_request.ready_for_review'], async ({ payload }) => {
    const { pull_request: pr, label, action } = payload;

    const hasAPILabel = (id?: number) => id === API_REVIEW_REQUESTED_LABEL_ID;

    const shouldReviewNewAPIPR = action === 'labeled' && !pr.draft && hasAPILabel(label?.id);
    const shouldReviewReadyAPIPR =
      action === 'ready_for_review' && pr.labels.some(({ id }) => hasAPILabel(id));

    const isDecember = new Date(payload.pull_request.updated_at).getMonth() === 11;

    if (!isDecember && (shouldReviewReadyAPIPR || shouldReviewNewAPIPR)) {
      await postToSlack(pr);
    }
  });
};
