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
import { TEXT_LIMITS, UpdateEntityByUser } from '@/features/memory';
import type { Gender } from '@/services/database';
import { useState, type FormEvent } from 'react';
import { SAVE_FAILED_MESSAGE } from '../constants/memory-manager';

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' }
];
const VALID_GENDERS: ReadonlySet<string> = new Set(
  GENDER_OPTIONS.map(option => option.value)
);

export type DetailsTarget = {
  entity_id: string;
  source_name: string;
  gender: Gender;
  notes_en: string;
};

type EntityDetailsDialogProps = {
  target: DetailsTarget | null;
  OnClose: () => void;
  OnCloseAutoFocus?: (event: Event) => void;
  OnSaved: () => void;
};

function EntityDetailsForm({
  target,
  OnClose,
  OnSaved
}: Omit<EntityDetailsDialogProps, 'target' | 'OnCloseAutoFocus'> & {
  target: DetailsTarget;
}) {
  const [gender, set_gender] = useState<Gender>(target.gender);
  const [notes, set_notes] = useState(target.notes_en);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_saving, set_is_saving] = useState(false);

  async function HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    set_is_saving(true);

    try {
      await UpdateEntityByUser(target.entity_id, {
        gender,
        notes_en: notes.trim()
      });
      OnClose();
      OnSaved();
    } catch {
      set_error_message(SAVE_FAILED_MESSAGE);
    } finally {
      set_is_saving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={HandleSubmit}>
      <Field>
        <FieldLabel htmlFor="entity-gender">Gender</FieldLabel>
        <Select
          value={gender}
          onValueChange={next_gender => {
            if (VALID_GENDERS.has(next_gender)) {
              set_gender(next_gender as Gender);
            }
          }}
        >
          <SelectTrigger id="entity-gender" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {GENDER_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field data-invalid={error_message ? true : undefined}>
        <FieldLabel htmlFor="entity-notes">Notes</FieldLabel>
        <Input
          id="entity-notes"
          value={notes}
          maxLength={TEXT_LIMITS.notes_en}
          onChange={event => set_notes(event.target.value)}
        />
        {error_message ? <FieldError>{error_message}</FieldError> : null}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={OnClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={is_saving}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

// Gender and notes of one character or term, moved out of the table row so
// the table fits the page (plan 0026).
export function EntityDetailsDialog({
  target,
  OnClose,
  OnCloseAutoFocus,
  OnSaved
}: EntityDetailsDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={is_open => {
        if (!is_open) OnClose();
      }}
    >
      <DialogContent onCloseAutoFocus={OnCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>
            {target ? `Details of ${target.source_name}` : 'Details'}
          </DialogTitle>
        </DialogHeader>
        {target ? (
          <EntityDetailsForm
            key={target.entity_id}
            target={target}
            OnClose={OnClose}
            OnSaved={OnSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
