/**
 * Módulo de Extracción y Parseo de Metadatos de Git (HU01 - T3 / HU07 - T2)
 *
 * Responsable asignado en Sprint 1: Ángel López Sánchez (AS) / Candela Marco Jiménez (CJ)
 * Revisor asignado: Jesús Cañete García (JG) / Alejandro Jesús Ortiz Zamora (AZ)
 */

function normalizeIdentity(gitIdentity, githubIdentity) {
  if (!gitIdentity && !githubIdentity) {
    return null;
  }

  const name = gitIdentity?.name || githubIdentity?.name || null;
  const email = gitIdentity?.email || githubIdentity?.email || null;
  const login = githubIdentity?.login || null;
  const userType = githubIdentity?.type || null;

  if (!name && !email && !login) {
    return null;
  }

  const identifier = `${name || ''} ${email || ''} ${login || ''}`;
  return {
    name,
    email,
    login,
    userType,
    isBot: userType === 'Bot' || /\[bot\]|github-actions|dependabot/i.test(identifier),
  };
}

function parseTrailers(message) {
  const trailers = {};
  const lines = String(message || '').split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (match) {
      (trailers[match[1]] ||= []).push(match[2].trim());
    }
  }

  return trailers;
}

function parseCoAuthors(trailers) {
  return Object.entries(trailers)
    .filter(([key]) => key.toLowerCase() === 'co-authored-by')
    .flatMap(([, values]) =>
      values.flatMap((value) => {
        const match = value.match(/^\s*(.+?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
        if (!match) {
          return [];
        }

        return [normalizeIdentity({ name: match[1].trim(), email: match[2].trim() }, null)];
      }),
    );
}

function addUniqueIdentity(identities, identity) {
  if (!identity) {
    return;
  }

  const email = identity.email?.toLowerCase();
  const login = identity.login?.toLowerCase();
  const name = identity.name?.toLowerCase();
  const alreadyPresent = identities.some(
    (existing) =>
      (email && existing.email?.toLowerCase() === email) ||
      (login && existing.login?.toLowerCase() === login) ||
      (!email && !login && name && existing.name?.toLowerCase() === name),
  );

  if (!alreadyPresent) {
    identities.push(identity);
  }
}

/**
 * Normaliza los datos de autoría de los commits devueltos por la API de GitHub.
 * @param {object} options Objeto con la propiedad commits (lista de commits de GitHub).
 * @returns {{commits: Array<object>, identities: Array<object>}}
 */
function parseCommitMetadata(options = {}) {
  const commits = [];
  const identities = [];

  for (const commit of Array.isArray(options?.commits) ? options.commits : []) {
    const gitCommit = commit.commit || {};
    const message = gitCommit.message || '';
    const trailers = parseTrailers(message);
    const author = normalizeIdentity(gitCommit.author, commit.author);
    const committer = normalizeIdentity(gitCommit.committer, commit.committer);
    const coAuthors = parseCoAuthors(trailers);
    const diff = (commit.files || [])
      .map((file) => file.patch)
      .filter((patch) => typeof patch === 'string' && patch.length > 0)
      .join('\n');

    commits.push({
      sha: commit.sha || null,
      author,
      committer,
      coAuthors,
      trailers,
      message,
      diff,
    });

    addUniqueIdentity(identities, author);
    addUniqueIdentity(identities, committer);
    coAuthors.forEach((identity) => addUniqueIdentity(identities, identity));
  }

  return { commits, identities };
}

module.exports = { parseCommitMetadata };
