import { describe, expect, it } from 'vitest';
import {
  extractEditorText,
  occurrenceIndex,
  offsetForPosition,
  rangeForOffsets,
  replaceInMarkdown,
} from '../src/lib/editorText';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('editorText', () => {
  it('extracts block-separated plain text across inline formatting', () => {
    const root = mount(
      '<h1>Title</h1><p>Hello <strong>bold</strong> world</p><ul><li>one</li></ul>',
    );
    const et = extractEditorText(root);
    expect(et.text).toBe('Title\n\nHello bold world\n\none');
  });

  it('maps offsets to DOM ranges spanning several text nodes', () => {
    const root = mount('<p>Hello <em>big</em> world</p>');
    const et = extractEditorText(root);
    const start = et.text.indexOf('o big w');
    const range = rangeForOffsets(et, start, start + 'o big w'.length);
    expect(range?.toString()).toBe('o big w');
  });

  it('converts DOM positions back to offsets', () => {
    const root = mount('<p>abc</p><p>def</p>');
    const et = extractEditorText(root);
    const second = root.querySelectorAll('p')[1]!.firstChild!;
    expect(offsetForPosition(et, second, 1)).toBe(et.text.indexOf('e'));
  });

  it('replaces the right occurrence in markdown', () => {
    const text = 'the the cat. the the dog.';
    const second = text.lastIndexOf('the the');
    expect(occurrenceIndex(text, 'the the', second)).toBe(1);
    expect(replaceInMarkdown('**the the** cat. the the dog.', 'the the', 'the', 1)).toBe(
      '**the the** cat. the dog.',
    );
    expect(replaceInMarkdown('abc', 'zzz', 'y', 0)).toBeNull();
  });
});
