// Shared by every adapter, so PRs look the same whichever Git host is used
export function describeSuggestion({docPath, permalink, note, user, manifest}) {
  return {
    title: `Suggested edit: ${docPath}`,
    body: [
      `**Page:** ${permalink}`,
      `**Submitted by:** ${user ? `${user.name} (${user.provider}, ${user.id})` : 'Anonymous reader'}`,
      `**Reader's note:** ${note?.trim() || '_None_'}`,
      `Built from commit ${manifest.commit}.`,
    ].join('\n\n'),
  };
}

export function branchName(docPath) {
  const slug = docPath.replace(/\.mdx?$/, '').replace(/[^a-z0-9]+/gi, '-');
  return `suggest/${slug}-${Date.now()}`;
}

// Path of the doc in the repo, without a leading slash
export function repoFilePath(manifest, docPath) {
  return [manifest.docsPathInRepo, docPath].filter(Boolean).join('/');
}