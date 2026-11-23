"use client";

import { useState } from "react";
import { FAQ_ENTRIES, filterFaqEntries } from "@illamhelp/shared-types";

import { Button, Card, Field, TextInput } from "@/components/ui/primitives";
import { FaqList } from "./LegalContent";

export function FaqSearch(): JSX.Element {
  const [query, setQuery] = useState("");
  const entries = filterFaqEntries(FAQ_ENTRIES, query);

  return (
    <div className="stack">
      <Card variant="action" className="stack">
        <Field label="Search questions">
          <TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. verification documents" />
        </Field>
        {query.trim() ? (
          <div className="legal-search-actions">
            <p className="muted-text" role="status">
              {entries.length ? `${entries.length} matching ${entries.length === 1 ? "question" : "questions"}` : "No matching questions. Try a different search."}
            </p>
            <Button type="button" variant="ghost" onClick={() => setQuery("")}>Clear search</Button>
          </div>
        ) : null}
      </Card>
      <FaqList entries={entries} />
    </div>
  );
}
