import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  lineNumbers,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';

const templateVariableMatcher = new MatchDecorator({
  regexp: /\{\{#[^#{}]+#\}\}/g,
  decoration: Decoration.mark({ class: 'bg-primary/10 text-primary font-semibold' }),
});

const templateVariableHighlights = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = templateVariableMatcher.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = templateVariableMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (value) => value.decorations },
);

export const CodeEditor = ({
  value,
  onChange,
  ariaLabel,
  language = 'javascript',
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  language?: 'javascript' | 'template';
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          lineNumbers(),
          language === 'javascript' ? javascript() : templateVariableHighlights,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.contentDOM.setAttribute('aria-label', ariaLabel);
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [ariaLabel, language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={hostRef}
      className="border-input bg-background max-h-72 overflow-auto rounded-md border text-sm"
    />
  );
};
