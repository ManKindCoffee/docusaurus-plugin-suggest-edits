import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {usePluginData} from '@docusaurus/useGlobalData';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {diffLines, diffWords} from 'diff';
import styles from './styles.module.css';
import OriginalEditThisPage from '@theme-init/EditThisPage';
import useRouteContext from '@docusaurus/useRouteContext';

const CONTEXT_LINES = 3;
// Only the default docs instance gets the editor; blog posts and other pages
// keep Docusaurus's normal "Edit this page" link.
export default function EditThisPage(props) {
  const {plugin} = useRouteContext();
  const isDefaultDocs = plugin?.name === 'docusaurus-plugin-content-docs' && plugin?.id === 'default';
  if (!isDefaultDocs) return <OriginalEditThisPage {...props} />;
  return <DocEditButton />;
}

function DocEditButton() {
  const {metadata} = useDoc();
  const {label, docsDir, files} = usePluginData('suggest-edits');
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  const docPath = metadata.source.replace(`@site/${docsDir}/`, '');
  if (!files.includes(docPath)) return null; // excluded page: no button

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus(); // return focus to the button
  };

  return (
    <>
      <button ref={buttonRef} className="button button--link button--sm" onClick={() => setOpen(true)}>
        ✏️ {label}
      </button>
      {open && <SuggestEditModal docPath={docPath} onClose={close} />}
    </>
  );
}

function SuggestEditModal({docPath, onClose}) {
  const {metadata} = useDoc();
  const {endpoint, loginUrl} = usePluginData('suggest-edits');
  const draftKey = `suggest-edits:draft:${docPath}`;
  const [needsLogin, setNeedsLogin] = useState(false);
  const srcUrl = useBaseUrl(`/_suggest/src/${docPath}`);
  const manifestUrl = useBaseUrl('/_suggest/manifest.json');
  const editorRef = useRef(null);

  // loading → edit → review → sending → done (or error)
  const [step, setStep] = useState('loading');
  const [manifest, setManifest] = useState(null);
  const [original, setOriginal] = useState('');
  const [proposed, setProposed] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const dirty = (step === 'edit' || step === 'review') && proposed !== original;

  const requestClose = useCallback(() => {
    if (step === 'sending') return;
    if (dirty && !window.confirm('Discard your changes?')) return;
    onClose();
  }, [dirty, step, onClose]);

  // Load the page source
  useEffect(() => {
    Promise.all([
      fetch(manifestUrl).then((r) => {
        const isJson = r.headers.get('content-type')?.includes('application/json');
        if (!r.ok || !isJson) {
          throw new Error('Suggest an edit only works on a production build. Run npm run build, then npm run serve.');
        }
        return r.json();
      }),
      fetch(srcUrl).then((r) => {
        if (!r.ok) throw new Error('Page source not found. Use a production build (npm run build).');
        return r.text();
      }),
    ])
      .then(([m, text]) => {
        setManifest(m);
        setOriginal(text);
        let draft = null;
        try {
          draft = sessionStorage.getItem(draftKey);
        } catch {}
        setProposed(draft ?? text);
        setStep('edit');
      })
      .catch((e) => {
        setError(e.message);
        setStep('error');
      });
  }, [manifestUrl, srcUrl]);

  // Escape closes
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && requestClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // Stop the page scrolling behind the modal
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Warn before leaving or refreshing the page with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Put the cursor in the editor when it appears
  useEffect(() => {
    if (step === 'edit') editorRef.current?.focus();
  }, [step]);

  async function submit() {
    setStep('sending');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          docPath,
          permalink: metadata.permalink,
          baseCommit: manifest.commit,
          proposed,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          data.error || (res.status === 401 ? 'Please sign in to suggest an edit.' : `Request failed (${res.status})`);
        throw Object.assign(new Error(message), {status: res.status});
      }
      try {
        sessionStorage.removeItem(draftKey);
      } catch {}
      setResult(data);
      setStep('done');
    } catch (e) {
      setError(e.message);
      setNeedsLogin(e.status === 401);
      setStep('edit'); // back to the editor, edits kept
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && requestClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="suggest-edit-title">
        <h2 id="suggest-edit-title">Suggest an edit: {metadata.title}</h2>

        {step === 'loading' && <p>Loading…</p>}

        {step === 'edit' && (
          <>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {needsLogin && loginUrl && (
              <p>
                <a
                  href={`${loginUrl}?post_login_redirect_uri=${encodeURIComponent(window.location.pathname)}`}
                  onClick={() => {
                    try {
                      sessionStorage.setItem(draftKey, proposed);
                    } catch {}
                  }}>
                  Sign in
                </a>
                , then select Suggest an edit again. Your changes will be kept.
              </p>
            )}
            <textarea
              ref={editorRef}
              className={styles.editor}
              aria-label="Page content"
              value={proposed}
              onChange={(e) => {
                setProposed(e.target.value);
                setError('');
              }}
            />
            <div className={styles.actions}>
              <button className="button button--secondary" onClick={requestClose}>Cancel</button>
              <button
                className="button button--primary"
                disabled={proposed === original}
                onClick={() => setStep('review')}>
                Review changes
              </button>
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <Diff original={original} proposed={proposed} />
            <label className={styles.label}>
              What did you change, and why? (optional)
              <textarea className={styles.note} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className={styles.actions}>
              <button className="button button--secondary" onClick={() => setStep('edit')}>Back to editing</button>
              <button className="button button--primary" onClick={submit}>Submit suggestion</button>
            </div>
          </>
        )}

        {step === 'sending' && <p>Submitting…</p>}

        {step === 'done' && (
          <>
            <p>Thanks. Your suggestion has been sent to the docs team for review.</p>
            {result?.url && (
              <p><a href={result.url} target="_blank" rel="noopener noreferrer">View pull request</a></p>
            )}
            <div className={styles.actions}>
              <button className="button button--primary" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <p className={styles.error} role="alert">{error}</p>
            <div className={styles.actions}>
              <button className="button button--secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Shows changed lines plus a few lines either side; collapses the rest.
// Within a changed line, highlights the words that differ.
function Diff({original, proposed}) {
  const lines = buildLines(original, proposed);

  const show = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.kind === 'same') return;
    const from = Math.max(0, i - CONTEXT_LINES);
    const to = Math.min(lines.length - 1, i + CONTEXT_LINES);
    for (let j = from; j <= to; j++) show[j] = true;
  });

  const rows = [];
  let hidden = 0;
  const flushGap = () => {
    if (hidden) rows.push({kind: 'gap', line: `… ${hidden} unchanged line${hidden === 1 ? '' : 's'}`});
    hidden = 0;
  };
  lines.forEach((l, i) => {
    if (show[i]) {
      flushGap();
      rows.push(l);
    } else hidden++;
  });
  flushGap();

  const prefix = {added: '+ ', removed: '- ', same: '  ', gap: ''};
  const wordClass = {added: styles.wordAdded, removed: styles.wordRemoved};
  return (
    <pre className={styles.diff}>
      {rows.map(({kind, line, words}, i) => (
        <div key={i} className={styles[kind]}>
          {prefix[kind]}
          {words
            ? words.map((w, j) => (
                <span key={j} className={w.changed ? wordClass[kind] : undefined}>
                  {w.text}
                </span>
              ))
            : line}
        </div>
      ))}
    </pre>
  );
}

// Line-level diff, with word-level detail where a removed line has a matching added line
function buildLines(original, proposed) {
  const split = (value) => value.replace(/\n$/, '').split('\n');
  const parts = diffLines(original, proposed);
  const lines = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const next = parts[i + 1];

    if (part.removed && next?.added) {
      const removed = split(part.value);
      const added = split(next.value);
      const removedRows = removed.map((line) => ({kind: 'removed', line}));
      const addedRows = added.map((line) => ({kind: 'added', line}));

      // Pair lines up in order and compare them word by word
      for (let j = 0; j < Math.min(removed.length, added.length); j++) {
        const words = compareWords(removed[j], added[j]);
        if (words) {
          removedRows[j].words = words.before;
          addedRows[j].words = words.after;
        }
      }
      lines.push(...removedRows, ...addedRows);
      i++; // the added part has been handled
      continue;
    }

    const kind = part.added ? 'added' : part.removed ? 'removed' : 'same';
    split(part.value).forEach((line) => lines.push({kind, line}));
  }
  return lines;
}

// Returns word segments for both versions, or null if the line is mostly rewritten
function compareWords(before, after) {
  const changes = diffWords(before, after);
  const changedChars = changes
    .filter((c) => c.added || c.removed)
    .reduce((sum, c) => sum + c.value.length, 0);
  if (changedChars > (before.length + after.length) / 2) return null;

  const result = {before: [], after: []};
  changes.forEach((c) => {
    if (!c.added) result.before.push({text: c.value, changed: Boolean(c.removed)});
    if (!c.removed) result.after.push({text: c.value, changed: Boolean(c.added)});
  });
  return result;
}