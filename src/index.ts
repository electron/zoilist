import { Probot } from 'probot';
import { WebClient } from '@slack/web-api';

const API_REVIEW_REQUESTED_LABEL_ID = 1603621692; // api-review/requested
const { SLACK_BOT_TOKEN, NODE_ENV } = process.env;

if (!SLACK_BOT_TOKEN && NODE_ENV !== 'test') {
  console.error('Missing environment variable SLACK_BOT_TOKEN');
  process.exit(1);
}

const slack = new WebClient(SLACK_BOT_TOKEN);

export = (app: Probot) => {
  app.on('pull_request.labeled', async ({ payload }) => {
    const { pull_request: pr, label } = payload;

    if (label?.id === API_REVIEW_REQUESTED_LABEL_ID && !pr.draft) {
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
  });
};
