import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel
} from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { UpdateEntityByUser } from '@/features/memory';
import { useState, type FormEvent } from 'react';
import { SAVE_FAILED_MESSAGE } from '../constants/memory-manager';
import { ParseAliasInput } from '../lib/parse-alias-input';

export type AliasTarget = {
  entity_id: string;
  source_name: string;
  source_aliases: string[];
};

type EditAliasesDialogProps = {
  target: AliasTarget | null;
  OnClose: () => void;
  OnCloseAutoFocus?: (event: Event) => void;
  OnSaved: () => void;
};

function EditAliasesForm({
  target,
  OnClose,
  OnSaved
}: Omit<EditAliasesDialogProps, 'target'> & { target: AliasTarget }) {
  const [alias_text, set_alias_text] = useState(
    target.source_aliases.join('\n')
  );
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_saving, set_is_saving] = useState(false);

  async function HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    set_is_saving(true);

    try {
      await UpdateEntityByUser(target.entity_id, {
        source_aliases: ParseAliasInput(alias_text)
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
      <Field data-invalid={error_message ? true : undefined}>
        <FieldLabel htmlFor="entity-aliases">Aliases</FieldLabel>
        <Textarea
          id="entity-aliases"
          rows={5}
          value={alias_text}
          aria-describedby="entity-aliases-help"
          onChange={event => set_alias_text(event.target.value)}
        />
        <FieldDescription id="entity-aliases-help">
          One alias per line, in the original script or romanized.
        </FieldDescription>
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

export function EditAliasesDialog({
  target,
  OnClose,
  OnCloseAutoFocus,
  OnSaved
}: EditAliasesDialogProps) {
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
            {target ? `Aliases for ${target.source_name}` : 'Aliases'}
          </DialogTitle>
        </DialogHeader>
        {target ? (
          <EditAliasesForm
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
