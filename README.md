# Flowquill

The ultimate [Neovim](https://github.com/neovim/neovim) alternative for VSCode. Custom modes, key bindings, and a clean
interface inspired by [Helix](https://github.com/helix-editor/helix).

## Features
- Pure keyboard efficiency
- Beautiful Zen interface
- Quick Scripting and Macros
- Lightning-fast navigation
- Easy to learn
- Modal editing
- Multi-cursor magic at your fingertips

## Modes
- **Move mode**: Navigate with vim-like motions (`h`, `j`, `k`, `l`, etc.)
- **Modify mode**: Write and edit code
- **Select mode**: Change your selection
- **Inspect mode**: Explore code details with definitions, references, and more.

## Key Bindings

### Editor

`esc` Return to move mode

### Smart Coding

`⎈space` Intelisense

`⇧space` Completion

`⎈⇧space`/`⎈i` Inline Chat

#### Tool Panels

`⎈1`/`⎈⇧g` Toggle git

`⎈2`/`⎈⇧e` Toggle explorer

`⎈3` Toggle copilot chat

`⎈4`/`⎈⇧s` Toggle search

`⎈5`/`⎈⇧t` Toggle timeline

`⎈6`/`⎈⇧l` Toggle outline

`⎈7`/`⎈⇧b` Toggle debug

`⎈8`/`⎈⇧x` Toggle extensions

`⎈b` Toggle sidebar

`⎈o` Toggle panel

#### Windows

`⎈p` Pop this tab out into a new window

`⎈⎇p` Join this tab back

`⎈m` Make one more window

#### Search

`⎈⇧f` Search codebase

`⎈t` Search symbol

#### Tabs

`⎈tab` Switch tab forwards, `⎈⇧tab` backwards

`⎈w` Close tab

#### Files

`⎈s` Save file

`⎈r` Switch to recent project

`Drag n' Drop` Open file / folder

`⎈g` Jump to line

`⎈n` Open a new temporary file

`⎈⇧s` Save all files

### Movement

#### Basic

`h` Left, `⎇h` extending

`j` Down, `⎇j` extending

`k` Up, `⎇k` extending

`l` Right, `⎇l` extending

#### Words

`w` Select ahead until next word, `⎇w` extending

`e` Select ahead to word end, `⎇e` extending

`b` Select back to word start, `⎇b` extending

`g` Get (select & copy) word, `⇧g` non-whitespace

`⇧w` Select ahead until next non-whitespace, `⎇⇧w` extending

`⇧e` Select ahead until next whitespace, `⎇⇧e` extending

`⇧b` Select back until whitespace, `⎇⇧b` extending

#### Characters

`f◌` Select ahead to ◌, `⎇f◌` extending

`⇧f◌` Select back to ◌, `⎇⇧f◌` extending

`t◌` Select ahead until ◌, `⎇t◌` extending

`⇧t◌` Select back until ◌, `⎇⇧t◌` extending

#### Lines & Page

`x` Select line below, `⇧x` above

`⎈h`/`⎈left` Select to line start, `⎈⎇h`/`⎈⎇left` extending

`⎈l`/`⎈right` Select to line end, `⎈⎇l`/`⎈⎇right` extending

`⎈d`/`⎈⇧u` Halfpage down, `⎈⎇d`/`⎈⎇⇧u` extending

`⎈u`/`⎈⇧d` Halfpage up, `⎈⎇u`/`⎈⎇⇧d` extending

`z` Toggle fold at cursor

#### Search

`⎈f` Search

`⎈⎇f` Search and Replace

`n` Next search result, `⇧n` previous result

#### Selection

`⎈a` Select all

`;` Clear selections

`v⌨` Visually select

`⇧;` Switch cursor side

`⎇n` Select next ocurrence of selection, `⎇⇧n` previous ocurrence

`m￼` Select object

`⎇-` Trim whitespaces from selection

`⎇c`/`⎈⇧down` Copy selections to below, `⎇⇧c`/`⎈⇧up` above

#### Multiselection

`s` Select all regex matches in selection or leap ahead if nothing selected

`⇧s` Split selection for lines or leap back if nothing selected

`⇧k` Keep selections matching regex

`⇧m` Merge selections 

`⎇s` Split by delimiter regex

#### Jumppoints

`[` To last Jumppoint, `]` next Jumppoint

### Coding

#### Delete

`d`/`⎈x` Cut, `del`/`backspace` Delete

#### Paste

`p`/`⎈v` Paste before, `⇧p`/`⎈⇧v` after

`⎇p` Duplicate line to below, `⎇⇧p` above

#### Undo/Redo

`u`/`⎈z`/`⎈⇧y` Undo

`⇧u`/`⎈⇧z`/`⎈y` Redo

#### Insert

`i ⌨` Insert ⌨ before selection, `⎇i ⌨` keep selection

`a ⌨` Append ⌨ after selection, `⎇a ⌨` keep selection

`⇧i ⌨` Insert ⌨ at line start

`⇧a ⌨` Append ⌨ at line end

`o ⌨` Add ⌨ as newline below, `⇧o ⌨` above

#### Replace

`c ⌨` Change seletion to ⌨ after Copy, `⎈⎇c ⌨` without copying

`r◌` Replace each character with ◌

`⇧r` Replace with clipboard after Copy, `⎈⇧r` without copying

#### Lines

`⎈j`/`⎈down` move line down, `⎈k`/`⎈up` up

`tab` Indent, `⇧tab` Unindent

`⇧j` Join lines

`-` Remove empty lines from selection

#### Spacing

`enter` Add line below selection, `⇧enter` above selection

`⎇space` Add space before selection, `⎇⇧space` after selection

#### Formatting

`⇧c` Comment selected lines (toggle)

`'￼` Enclose as ￼

`=` Format selection

`⎇=` Switch case, `⎈=` Convert to lowercase, `⎈⇧=` uppercase

#### Repeat

`q` Execute this macro

`.` Repeat change over here

#### Other

`⎈⇧k`/`⎇⇧up` increment selected number, `⎈⇧j`/`⎇⇧down` decrement

`⎇⇧]` Cycle selection content forward, `⎇⇧[` backward

`/` to pipe each selection through a JavaScript Expression

`⇧/` to evaluate all selections in a JavaScript Expression, showing result below in the prompt

`⎈/` to open a JavaScript scratchpad with a run function which each selection is piped through until the file is closed

`⇧⎈/` open a javascript file with the selections as array sels

### Interacting

`y`/`⎈c` Copy

`space` Inspect

#### Repeat

`⇧q` Record a macro (toggle)

`⎈q` Load a macro

`⎈⇧q` Save a macro

`[0-9]`* `🗲` Run 🗲 this many times


### Inspecting

#### Go to

`f` Go to definition/file

`t` Go to type definition

`z` Go to implementations

`g` Go to references

#### Refator

`r` Rename

`⇧r` Rename to clipboard

`space` Quick Fix

`e` Inspect next problem, `⇧e` previous problem

#### Copy

`y`/`⎈c` Copy the symbol

### Menus

`h` Left

`j` Down

`k` Up

`l` Right

#### Explorer

`a` Create file, `⇧a` folder

`r`/`F2` Rename

## Zen philosophy

We remove most the fuss from your view. No split panes or distractions.
It is the window manager's job to take care of panes. Use `⎈p` and multiple windows.
