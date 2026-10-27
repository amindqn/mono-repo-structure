import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearPrivateQueries, createQueryClient, queryKeys } from '../src/lib/query-client.js';
test('separates account caches and removes private data at session boundaries', async () => {
  const client = createQueryClient();
  try {
    client.setQueryData(queryKeys.tasks('alice'), { items: ['private-alice-task'] });
    client.setQueryData(queryKeys.tasks('bob'), { items: ['private-bob-task'] });
    client.setQueryData(queryKeys.session, { id: 'alice' });
    assert.notDeepEqual(queryKeys.tasks('alice'), queryKeys.tasks('bob'));
    await clearPrivateQueries(client);
    assert.equal(client.getQueryData(queryKeys.tasks('alice')), undefined);
    assert.equal(client.getQueryData(queryKeys.tasks('bob')), undefined);
    assert.deepEqual(client.getQueryData(queryKeys.session), { id: 'alice' });
  } finally {
    client.clear();
  }
});
test('late results cannot repopulate an old account cache after cancellation', async () => {
  const client = createQueryClient();
  let finish: (value: string) => void = () => {};
  const pending = client
    .fetchQuery({
      queryKey: queryKeys.tasks('alice'),
      queryFn: ({ signal }) => {
        assert.equal(signal.aborted, false);
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    })
    .catch(() => 'cancelled');
  await clearPrivateQueries(client);
  finish('private-result-after-logout');
  await pending;
  assert.equal(client.getQueryData(queryKeys.tasks('alice')), undefined);
  client.clear();
});
