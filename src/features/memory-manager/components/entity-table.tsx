import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { DeleteEntity } from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';
import type { EntityKind, EntityRecord } from '@/services/database';
import { Bot, Lock, MoreHorizontal, Plus, Search, UserPen } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  LANGUAGE_LABELS,
  SAVE_FAILED_MESSAGE,
  TARGET_LANGUAGES
} from '../constants/memory-manager';
import { BuildEntityRows, type EntityRow } from '../lib/build-entity-rows';
import { AddEntityDialog } from './add-entity-dialog';
import { EditAliasesDialog, type AliasTarget } from './edit-aliases-dialog';
import {
  EntityDetailsDialog,
  type DetailsTarget
} from './entity-details-dialog';
import { EntityTranslationCell } from './entity-translation-cell';
import { SpeechDialog, type SpeechTarget } from './speech-dialog';

type EntityTableProps = {
  series_id: string;
  entities: EntityRecord[];
  default_target_language: TargetLanguage;
  OnChanged: () => void;
};

type KindFilter = 'all' | EntityKind;

const KIND_FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'character', label: 'Characters' },
  { value: 'term', label: 'Terms' }
];
const VALID_KIND_FILTERS: ReadonlySet<string> = new Set(
  KIND_FILTER_OPTIONS.map(option => option.value)
);
const LANGUAGE_OPTIONS = TARGET_LANGUAGES.map(language => ({
  value: language,
  label: LANGUAGE_LABELS[language]
}));

type EntityTableRowProps = {
  row: EntityRow;
  table_language: TargetLanguage;
  OnDelete: (row: EntityRow) => void;
  OnEditAliases: (row: EntityRow) => void;
  OnEditDetails: (row: EntityRow) => void;
  OnEditSpeech: (row: EntityRow) => void;
  OnRememberReturnFocus: (element: HTMLElement | null) => void;
  OnSaved: () => void;
  OnSaveFailed: () => void;
};

function EntityTableRow({
  row,
  table_language,
  OnDelete,
  OnEditAliases,
  OnEditDetails,
  OnEditSpeech,
  OnRememberReturnFocus,
  OnSaved,
  OnSaveFailed
}: EntityTableRowProps) {
  const menu_trigger_ref = useRef<HTMLButtonElement>(null);

  function RunMenuAction(action: (row: EntityRow) => void) {
    OnRememberReturnFocus(menu_trigger_ref.current);
    action(row);
  }

  return (
    <TableRow>
      <TableCell className="align-top [overflow-wrap:anywhere] whitespace-normal">
        <div className="font-medium">{row.source_name}</div>
        {row.aliases_text ? (
          <div className="text-muted-foreground text-xs">
            {row.aliases_text}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="align-top">{row.kind_label}</TableCell>
      <TableCell className="align-top">
        {/* Keyed by language, so a draft never carries into another one. */}
        <EntityTranslationCell
          key={table_language}
          entity_id={row.entity_id}
          source_name={row.source_name}
          target_language={table_language}
          cell={row.cells[table_language]}
          OnSaved={OnSaved}
          OnSaveFailed={OnSaveFailed}
        />
      </TableCell>
      <TableCell className="align-top">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={menu_trigger_ref}
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${row.source_name}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => RunMenuAction(OnEditDetails)}>
              Details…
            </DropdownMenuItem>
            {row.kind === 'character' ? (
              <DropdownMenuItem onSelect={() => RunMenuAction(OnEditSpeech)}>
                Speech…
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => RunMenuAction(OnEditAliases)}>
              Aliases…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => RunMenuAction(OnDelete)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export function EntityTable({
  series_id,
  entities,
  default_target_language,
  OnChanged
}: EntityTableProps) {
  const [query, set_query] = useState('');
  const [kind_filter, set_kind_filter] = useState<KindFilter>('all');
  const [is_adding, set_is_adding] = useState(false);
  const [alias_target, set_alias_target] = useState<AliasTarget | null>(null);
  const [speech_target, set_speech_target] = useState<SpeechTarget | null>(
    null
  );
  const [delete_target, set_delete_target] = useState<EntityRow | null>(null);
  const [details_target, set_details_target] = useState<DetailsTarget | null>(
    null
  );
  // The table shows one language at a time, so it fits the page (plan 0026).
  const [table_language, set_table_language] = useState<TargetLanguage>(
    default_target_language
  );
  const [error_message, set_error_message] = useState<string | null>(null);
  const rows = BuildEntityRows(entities, { query, kind: kind_filter });
  // These dialogs open from state, not a DialogTrigger, so Radix has no
  // element to refocus on close; return focus to the control that opened one.
  const return_focus_ref = useRef<HTMLElement | null>(null);

  function RememberReturnFocus(element: HTMLElement | null) {
    return_focus_ref.current = element;
  }

  function ReturnFocus(event: Event) {
    const return_focus_element = return_focus_ref.current;

    return_focus_ref.current = null;

    // The opener can be gone (row deleted or filtered out). Radix's default
    // then has no trigger either, so focus falls to the page body.
    if (!return_focus_element?.isConnected) return;

    event.preventDefault();
    return_focus_element.focus();
  }

  function HandleSaveFailed() {
    set_error_message(SAVE_FAILED_MESSAGE);
    OnChanged();
  }

  function HandleSaved() {
    set_error_message(null);
    OnChanged();
  }

  async function DeleteTarget(target: EntityRow) {
    try {
      await DeleteEntity(target.entity_id);
      HandleSaved();
    } catch {
      HandleSaveFailed();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            aria-hidden="true"
            className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            aria-label="Search characters and terms"
            className="pl-8"
            value={query}
            onChange={event => set_query(event.target.value)}
          />
        </div>
        <Select
          value={kind_filter}
          onValueChange={next_filter => {
            if (VALID_KIND_FILTERS.has(next_filter)) {
              set_kind_filter(next_filter as KindFilter);
            }
          }}
        >
          <SelectTrigger aria-label="Filter by kind" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {KIND_FILTER_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={table_language}
          onValueChange={next_language => {
            const picked_language = TARGET_LANGUAGES.find(
              language => language === next_language
            );

            if (picked_language) set_table_language(picked_language);
          }}
        >
          <SelectTrigger aria-label="Translation language" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {LANGUAGE_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={event => {
            RememberReturnFocus(event.currentTarget);
            set_is_adding(true);
          }}
        >
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>
      {error_message ? (
        <p role="alert" className="text-destructive text-sm">
          {error_message}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <Empty>
          <EmptyDescription>
            {entities.length === 0
              ? 'No characters or terms yet.'
              : 'Nothing matches your search.'}
          </EmptyDescription>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>{LANGUAGE_LABELS[table_language]}</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <EntityTableRow
                key={row.entity_id}
                row={row}
                table_language={table_language}
                OnDelete={set_delete_target}
                OnEditAliases={target =>
                  set_alias_target({
                    entity_id: target.entity_id,
                    source_name: target.source_name,
                    source_aliases:
                      entities.find(
                        entity => entity.entity_id === target.entity_id
                      )?.source_aliases ?? []
                  })
                }
                OnEditDetails={target =>
                  set_details_target({
                    entity_id: target.entity_id,
                    source_name: target.source_name,
                    gender: target.gender,
                    notes_en: target.notes_en
                  })
                }
                OnEditSpeech={target =>
                  set_speech_target({
                    entity_id: target.entity_id,
                    source_name: target.source_name
                  })
                }
                OnRememberReturnFocus={RememberReturnFocus}
                OnSaved={HandleSaved}
                OnSaveFailed={HandleSaveFailed}
              />
            ))}
          </TableBody>
        </Table>
      )}
      <ul className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        <li className="flex items-center gap-1">
          <UserPen aria-hidden="true" className="size-3.5" />
          User-edited
        </li>
        <li className="flex items-center gap-1">
          <Bot aria-hidden="true" className="size-3.5" />
          AI-added
        </li>
        <li className="flex items-center gap-1">
          <Lock aria-hidden="true" className="size-3.5" />
          Locked: always used in translations
        </li>
      </ul>
      <AddEntityDialog
        series_id={series_id}
        is_open={is_adding}
        OnAdded={HandleSaved}
        OnCloseAutoFocus={ReturnFocus}
        OnOpenChange={set_is_adding}
      />
      <EditAliasesDialog
        target={alias_target}
        OnClose={() => set_alias_target(null)}
        OnCloseAutoFocus={ReturnFocus}
        OnSaved={HandleSaved}
      />
      <EntityDetailsDialog
        target={details_target}
        OnClose={() => set_details_target(null)}
        OnCloseAutoFocus={ReturnFocus}
        OnSaved={HandleSaved}
      />
      <SpeechDialog
        target={speech_target}
        entities={entities}
        default_target_language={default_target_language}
        OnClose={() => set_speech_target(null)}
        OnCloseAutoFocus={ReturnFocus}
        OnSaved={HandleSaved}
      />
      <AlertDialog
        open={delete_target !== null}
        onOpenChange={is_open => {
          if (!is_open) set_delete_target(null);
        }}
      >
        <AlertDialogContent onCloseAutoFocus={ReturnFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Delete ${delete_target?.source_name ?? ''}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be used in translations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (delete_target) void DeleteTarget(delete_target);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
