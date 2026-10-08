# Sankofa document-upload tutorial

This guide explains how an approved Sankofa user submits a document for review.

## Important current limitation

The Sankofa API already supports deposits and the administration page supports
review actions. The public web interface does not yet have a finished
“Upload document” button or upload form. Until that screen is added, an
administrator or technical support person must use the API documentation at:

`https://sankofa-api.couma.workers.dev/docs`

The uploaded document is not public immediately. It enters the review workflow
as `submitted`; a librarian accepts or returns it, and an editor or
administrator publishes it.

## What the submitter needs

- An approved Sankofa account.
- The document file, preferably a searchable PDF.
- The collection where the document belongs.
- A title and short abstract.
- Author names, separated by `||` when there is more than one author.
- The licence and access choice agreed with AIMS.

## Step 1: sign in

1. Open the Sankofa website and choose **Sign in**.
2. Enter the approved Sankofa email address and password.
3. If the account is awaiting approval, contact the AIMS administrator.

## Step 2: find the collection

In the API documentation, open `GET /repository/collections` and choose
**Try it out**, then **Execute**. Copy the `id` of the appropriate collection,
for example `c-rwanda-theses`.

## Step 3: submit the document

In the API documentation, open `POST /repository/deposits`, choose **Try it
out**, and complete:

| Field | What to enter |
| --- | --- |
| `collection_uuid` | The collection `id` from Step 2 |
| `title` | The complete document title |
| `abstract` | A short summary |
| `authors` | One name, or multiple names separated by `||` |
| `licence` | The approved licence, such as `all-rights-reserved` |
| `access` | `open`, `embargoed`, `restricted`, or `metadata-only` |
| `embargo_end` | The end date if access is embargoed; otherwise leave blank |
| `file` | Select the document from the device |

Choose **Execute**. A successful response says `submitted_for_review` and
returns an item ID and file checksum. Save the item ID for support enquiries.

## Step 4: librarian review

1. A librarian signs in with an approved librarian, editor, or administrator
   account.
2. Open **Admin** and review the submission metadata and file.
3. Choose **Accept** when the record is ready for editorial approval, or
   **Return** when corrections are needed.

## Step 5: editor publication

An editor or administrator checks the final title, authors, abstract, Centre,
licence, access level, embargo and consent. The record is then published. Only
published, authorised records appear in public search and AI-assisted answers.

## From a phone or tablet

The website layout adapts to small screens, but the current API documentation
upload method is not yet a polished mobile upload experience. Keep the PDF in
the device's Files/Downloads app, use the browser's file picker for the `file`
field, and avoid closing the browser until the success response appears.

## If the upload fails

- **401/403:** the account is not signed in or has not been approved.
- **404 Collection not found:** copy the collection ID again from
  `GET /repository/collections`.
- **Unsupported access level:** use one of `open`, `embargoed`, `restricted`,
  or `metadata-only`.
- **Network error:** retry after confirming that the API health check opens:
  `https://sankofa-api.couma.workers.dev/ping`

