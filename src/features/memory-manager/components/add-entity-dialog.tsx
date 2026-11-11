import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { CreateUserEntity, TEXT_LIMITS } from '@/features/memory';
import type { EntityKind } from '@/services/database';
import { useState, type FormEvent } from 'react';
import { SAVE_FAILED_MESSAGE } from '../constants/memory-manager';

type AddEntityDialogProps = {
  series_id: string;
  is_open: boolean;
  OnAdded: () => void;
  OnCloseAutoFocus?: (event: Event) => void;
  OnOpenChange: (is_open: boolean) => void;
};

const VALID_KINDS: ReadonlySet<string> = new Set(['character', 'term']);

function AddEntityForm({
  series_id,
  OnAdded,
  OnOpenChange
}: Omit<AddEntityDialogProps, 'is_open'>) {
  const [kind, set_kind] = useState<EntityKind>('character');
  const [source_name, set_source_name] = useState('');
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_saving, set_is_saving] = useState(false);

  async function HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed_name = source_name.trim();

    if (trimmed_name === '') {
      set_error_message('Enter the name as written in the original.');

      return;
    }

    set_is_saving(true);

    try {
      await CreateUserEntity({ series_id, kind, source_name: trimmed_name });
      OnOpenChange(false);
      OnAdded();
    } catch {
      set_error_message(SAVE_FAILED_MESSAGE);
    } finally {
      set_is_saving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={HandleSubmit}>
      <Field>
        <FieldLabel htmlFor="add-entity-kind">Kind</FieldLabel>
        <Select
          value={kind}
          onValueChange={next_kind => {
            if (VALID_KINDS.has(next_kind)) {
              set_kind(next_kind as EntityKind);
            }
          }}
        >
          <SelectTrigger id="add-entity-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="character">Character</SelectItem>
            <SelectItem value="term">Term</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field data-invalid={error_message ? true : undefined}>
        <FieldLabel htmlFor="add-entity-source-name">
          Name in the original
        </FieldLabel>
        <Input
          id="add-entity-source-name"
          value={source_name}
          maxLength={TEXT_LIMITS.source_name}
          aria-invalid={error_message ? true : undefined}
          onChange={event => set_source_name(event.target.value)}
        />
        {error_message ? <FieldError>{error_message}</FieldError> : null}
      </Field>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => OnOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={is_saving}>
          Add
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddEntityDialog({
  series_id,
  is_open,
  OnAdded,
  OnCloseAutoFocus,
  OnOpenChange
}: AddEntityDialogProps) {
  return (
    <Dialog open={is_open} onOpenChange={OnOpenChange}>
      <DialogContent onCloseAutoFocus={OnCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Add a character or term</DialogTitle>
        </DialogHeader>
        {is_open ? (
          <AddEntityForm
            series_id={series_id}
            OnAdded={OnAdded}
            OnOpenChange={OnOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
