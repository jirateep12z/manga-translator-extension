import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { TEXT_LIMITS, UpdateEntityByUser } from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';
import { Bot, Lock, UserPen } from 'lucide-react';
import { useState } from 'react';
import { LANGUAGE_LABELS } from '../constants/memory-manager';
import type { EntityLanguageCell } from '../lib/build-entity-rows';

type EntityTranslationCellProps = {
  entity_id: string;
  source_name: string;
  target_language: TargetLanguage;
  cell: EntityLanguageCell;
  OnSaved: () => void;
  OnSaveFailed: () => void;
};

function OriginIndicator({ cell }: { cell: EntityLanguageCell }) {
  const OriginIcon =
    cell.origin === 'user' ? UserPen : cell.origin === 'ai' ? Bot : null;

  return (
    <span title={cell.origin_label} className="text-muted-foreground shrink-0">
      {OriginIcon ? <OriginIcon aria-hidden="true" className="size-4" /> : null}
      <span className="sr-only">{cell.origin_label}</span>
    </span>
  );
}

export function EntityTranslationCell({
  entity_id,
  source_name,
  target_language,
  cell,
  OnSaved,
  OnSaveFailed
}: EntityTranslationCellProps) {
  const [draft, set_draft] = useState(cell.text);
  const [saved_text, set_saved_text] = useState(cell.text);
  const language_label = LANGUAGE_LABELS[target_language];

  // A reload with new text from the database replaces the draft.
  if (saved_text !== cell.text) {
    set_saved_text(cell.text);
    set_draft(cell.text);
  }

  async function SaveTranslation(text: string, is_locked: boolean) {
    try {
      await UpdateEntityByUser(entity_id, {
        translations: { [target_language]: { text, is_locked } }
      });
      OnSaved();
    } catch {
      // Show the stored text again so the failed edit does not look saved.
      set_draft(cell.text);
      OnSaveFailed();
    }
  }

  function CommitDraft() {
    const trimmed_draft = draft.trim();

    if (trimmed_draft === '') {
      set_draft(cell.text);

      return;
    }

    if (trimmed_draft !== cell.text) {
      void SaveTranslation(trimmed_draft, cell.is_locked);
    }
  }

  return (
    <div className="flex min-w-40 items-center gap-2">
      <Input
        value={draft}
        maxLength={TEXT_LIMITS.entity_translation}
        aria-label={`${language_label} translation for ${source_name}`}
        onBlur={CommitDraft}
        onChange={event => set_draft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <OriginIndicator cell={cell} />
      <label className="flex items-center gap-1" title="Lock">
        <Checkbox
          checked={cell.is_locked}
          disabled={cell.text === ''}
          aria-label={`Lock ${language_label} translation for ${source_name}`}
          // Clicking here blurs the input first, which saves the draft. The
          // lock must keep that draft, not the text from before the edit.
          onCheckedChange={checked =>
            void SaveTranslation(draft.trim() || cell.text, checked === true)
          }
        />
        <Lock aria-hidden="true" className="text-muted-foreground size-3.5" />
      </label>
    </div>
  );
}
