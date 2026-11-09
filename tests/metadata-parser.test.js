const { parseCommitMetadata } = require('../src/git/metadata-parser');

describe('parseCommitMetadata', () => {
  test('returns empty commits and identities when none are provided', () => {
    expect(parseCommitMetadata()).toEqual({ commits: [], identities: [] });
  });

  test('normalizes GitHub commit identities, trailers, and available patches', () => {
    const result = parseCommitMetadata({
      commits: [
        {
          sha: 'abc123',
          author: { login: 'octocat', type: 'User' },
          committer: { login: 'github-actions[bot]', type: 'Bot' },
          commit: {
            author: { name: 'Octo Cat', email: 'octo@example.com' },
            committer: { name: 'GitHub Actions', email: 'actions@users.noreply.github.com' },
            message:
              'Add feature\n\nCo-authored-by: AI Assistant <ai@example.com>\nReviewed-by: Reviewer <reviewer@example.com>',
          },
          files: [{ filename: 'src/feature.js', patch: '+const feature = true;' }],
        },
      ],
    });

    expect(result.commits).toEqual([
      {
        sha: 'abc123',
        author: {
          name: 'Octo Cat',
          email: 'octo@example.com',
          login: 'octocat',
          userType: 'User',
          isBot: false,
        },
        committer: {
          name: 'GitHub Actions',
          email: 'actions@users.noreply.github.com',
          login: 'github-actions[bot]',
          userType: 'Bot',
          isBot: true,
        },
        coAuthors: [
          {
            name: 'AI Assistant',
            email: 'ai@example.com',
            login: null,
            userType: null,
            isBot: false,
          },
        ],
        trailers: {
          'Co-authored-by': ['AI Assistant <ai@example.com>'],
          'Reviewed-by': ['Reviewer <reviewer@example.com>'],
        },
        message:
          'Add feature\n\nCo-authored-by: AI Assistant <ai@example.com>\nReviewed-by: Reviewer <reviewer@example.com>',
        diff: '+const feature = true;',
      },
    ]);
  });

  test('collects unique identities from authors, committers, and co-authors', () => {
    const result = parseCommitMetadata({
      commits: [
        {
          author: { login: 'octocat', type: 'User' },
          commit: {
            author: { name: 'Octo Cat', email: 'octo@example.com' },
            committer: { name: 'Octo Cat', email: 'octo@example.com' },
            message: 'First change\n\nCo-authored-by: Pair Dev <pair@example.com>',
          },
        },
        {
          commit: {
            author: { name: 'Octo Cat', email: 'octo@example.com' },
            message: 'Second change',
          },
        },
      ],
    });

    expect(result.identities).toEqual([
      {
        name: 'Octo Cat',
        email: 'octo@example.com',
        login: 'octocat',
        userType: 'User',
        isBot: false,
      },
      {
        name: 'Pair Dev',
        email: 'pair@example.com',
        login: null,
        userType: null,
        isBot: false,
      },
    ]);
  });

  test('handles missing commit fields and ignores malformed co-author trailers', () => {
    const result = parseCommitMetadata({
      commits: [{ sha: 'empty', commit: { message: 'Change\n\nCo-authored-by: invalid entry' } }],
    });

    expect(result.commits[0]).toMatchObject({
      sha: 'empty',
      author: null,
      committer: null,
      coAuthors: [],
      trailers: {},
      message: 'Change\n\nCo-authored-by: invalid entry',
      diff: '',
    });
    expect(result.identities).toEqual([]);
  });
});
