## Basics
### Welcome
Welcome to Flowquill! Flowquill makes modal editing easier.
This tutor will carry you through how to use Flowquill to make editing easier.
This is the tutor panel, it shows the explainations and controls the editor on the left.
On the left you should try the keybinds described here to learn them.
If you complete the tasks here, it will let you go to the next step.
Flowquill can detect if you have completed these correctly, but you can also check them manually.
- [ ] Check this!
```md
Look at the panel on the right.
```

### Movement
By default you are in move mode.
Move using ←`h`, ↓`j`, ↑`k`, →`l`.
Hold `⎇` to extend your selection.
- [ ] Move to line 22
- [ ] Select "SELECTME"
```md
Navigate this text with hjkl.
bla[20]
Move to this line.
Select this using alt: SELECTME
```

### Scrolling
Move by half a page using ↓`⎈d`/`⎈⇧u`, ↑`⎈u`/`⎈⇧d`. The `⇧` variants allow you to do this with either hand.
Select to the end of the line using ←`⎈h`, →`⎈l`.
You can combine this with `⎇`, to extend your selection.
- [ ]  Select to the end of the first line
- [ ]  Scroll down by half a page
- [ ]  Scroll up by half a page
```md
Go to the end of this line.
bla[500]
```

## Lines
### Select Line
`x` selects a line ↓down.
`⇧x` selects a line ↑up.
- [ ] Select lines 4 to 5
- [ ] Select lines 17 to 16
```md
bla[3]
Select from here...
...to here.
bla[10]
Select to here...
...from here.
bla[3]
```

### Delete
`d` cuts the selection (copies + removes).
`⌦`/`⌫` deletes without copying.
- [ ] Delete the duplicate lines
```md
Keep this line.
Delete this line.
Delete this line.
Keep this line.
Delete this line.
Delete this line.
Keep this line.
```

## Words
### Word Motion
`w` moves to the next word start, `b` to the previous, `e` to the word end.
Hold `⎇` to extend.
- [ ] Delete "TARGET"
- [ ] Select "FROM" to "TO"
```md
Bla bla bla bla FROM bla TO bla bla.
Bla bla bla TARGET bla bla.
```

### WORD Motion
Adding `⇧` treats anything between whitespace as one word, skipping over punctuation.
- [ ] Delete "TAR.GET"
```md
foo-bar.baz boo-far.bar TAR.GET bla.baz-foo.
```

### Get Word
`g` selects and copies the current word.
`⇧` to ignore punctuation.
- [ ] Copy "COPY_ME"
```md
This line has COPY_ME in it.
```

## Editing
### Modify Mode
`i` inserts before the selection, `a` appends after.
Press `⎋` to return to move mode.
Hold `⎇` to keep the selection.
- [ ] Fix "Kello"
- [ ] Fix "worlt"
```md
Kello worlt!
```

### Line
`⇧i` inserts at the line start, `⇧a` at the line end.
`o` opens a new line below the cursor, `⇧o` above.
- [ ] Append "!" to line 1
- [ ] Add "New line" below line 2
- [ ] Add "New line" above "Add a line above here"
```md
Hello world
Add a line below here.
Bla bla bla.
Add a line above here.
```

## Copy & Paste
### Yank & Paste
`y`/`⎈c` copies.
`p`/`⎈v` pastes before the selection, `⇧p` pastes after.
- [ ] Copy "COPY_ME" and paste it after "Paste here: "
```md
COPY_ME
Paste here: 
```

### Duplicate
`⎇p` duplicates the selection below, `⎇⇧p` above.
- [ ] Duplicate line 2 below itself
```md
Bla bla bla.
DUPLICATE ME
Bla bla bla.
```

### Change
`c` replaces the selection with typed text, copying the old content.
`⇧r` replaces with clipboard, copying the old content.
`⎈r` and `⎈⎇c` to not copy.
- [ ] Change "OLD" to "NEW"
- [ ] Replace "TARGET" with what you just copied
```md
Replace OLD with something.
Replace TARGET with clipboard content.
```

### Undo & Redo
`u`/`⎈z`/`⎈⇧y` undoes, `⇧u`/`⎈y`/`⎈⇧z` redoes.
- [ ] Delete line 1
- [ ] Undo
- [ ] Redo
```md
Delete this line, then undo it.
```

## Editor
### Files, Panels & Windows
`⎈s` saves.
`⎈⇧s` saves all.
`⎈n` opens a new file.
`⎈g` jumps to a line number.
`⎈⇧f` searches the codebase.
`⎈t` searches symbols.

`⎈⇥`/`⎈⇧⇥` cycles tabs.
`⎈w` closes the current tab.
`⎈r` switches to a recent project.

`⎈1` git. `⎈2` explorer. `⎈3` copilot. `⎈4` search. `⎈5` timeline. `⎈6` outline. `⎈7` debug. `⎈8` extensions.
`⎈b` toggles the sidebar. `⎈o` toggles the bottom panel.

`⎈p` pops this tab into its own window.
`⎈⎇p` pulls it back.
`⎈m` opens a new window.

`a` adds a file in the explorer, `⇧a` a folder. `r` renames.

`[` jumps to the previous jumppoint, `]` to the next.
- [ ] Understood!

## Search
### File Search
`⎈f` opens search.
`n` jumps to the next match, `⇧n` to the previous.
Hold `⎇` to add a selection.
- [ ] Find the first "FIND_ME"
- [ ] Select the second occurrence
- [ ] Select both occurrences
```md
bla[157]
FIND_ME is somewhere here.
bla[120]
FIND_ME appears again here.
bla[60]
```

### Find Character
`f◌` selects forward to the next occurrence of ◌ (inclusive), `⇧f◌` to the previous.
Hold `⎇` to extend.
- [ ] Select to the "X"
```md
Select to X using f.
```

### Till Character
`t◌` selects to just before ◌, `⇧t◌` backwards.
Hold `⎇` to extend.
- [ ] Select the content inside the parentheses
- [ ] Delete it
```md
Delete what is inside here: (delete everything here)
```

## Selection
### Collapse & Flip
`;` clears all selections.
`⇧;` flips the selection cursor.
- [ ] Select "flip"
- [ ] Flip the cursor
- [ ] Clear the selection
```md
flip
```

### Select Mode
`v` enters select mode, which doesn't move the selection origins.
It's often equivalent to holding `⎇`.
`⎋` exits.
- [ ] Select "three words ahead"
```md
Select three words ahead then stop.
```

### Leap
With nothing selected, `s` leaps forward, `⇧s` backward.
Type two characters and Flowquill jumps to the nearest match in the file.
After the first character, labels appear next to potential targets. After the second character, if the closest match is obvious, you land there automatically. Otherwise, type the shown label to jump to that target.
If there are more matches than labels, press `␣` to cycle to the next group of labels, `⌫` to go back.
Pressing `↵` leaves you at the nearest match.
- [ ] Leap to "LEAP_TARGET"
```md
bla[50]
LEAP_TARGET is somewhere below.
bla[50]
```

### Select In Selection
`s`, with a selection, selects all regex matches within it.
- [ ] Select the paragraph below
- [ ] Select each "bla"
```md
Select this paragraph:
bla bla bla bla.
bla bla bla.
bla bla bla bla bla.
```

### Select Object
`m￼` selects an object ￼. `mi` selects just the inside.
- [ ] Select inside the parentheses
- [ ] Delete the contents
```md
Delete the contents: (delete everything here)
```

## Multi-cursor
### Copy Cursor
`⎇c` duplicates the cursor to the next line, `⎇⇧c` to the previous.
- [ ] Add cursors to all 5 lines
- [ ] Append ";" to each line
```md
const a = 1
const b = 2
const c = 3
const d = 4
const e = 5
```

### Split By Lines
`⇧s`, with a selection, splits it at every newline into separate cursors.
- [ ] Select all 3 lines
- [ ] Split
- [ ] Append "!" to each line
```md
line one
line two
line three
```

### Keep & Merge
`⇧k` keeps only selections matching a regex.
`⇧m` merges overlapping or adjacent selections.
- [ ] Select all 6 lines
- [ ] Split
- [ ] Keep selecting only lines containing "keep"
```md
keep this line
remove this line
keep this line too
remove this too
keep this one
remove this one
```

### Split Selections
`⎇s` splits each selection at every match of a delimiter regex.
- [ ] Select the CSV row
- [ ] Split by ","
- [ ] Wrap each item in quotes
```md
apple,banana,cherry,date
```

## Transform
### Enclose
`'￼` wraps the selection.
- [ ] Wrap "hello" in double quotes
- [ ] Wrap "world" in parentheses
```md
Wrap this: hello
And this: world
```

### Replace Character
`r◌` replaces every character in the selection with ◌.
- [ ] Select REDACT_ME
- [ ] Replace each character with "\*"
```md
REDACT_ME
```

### Case
`⎇=` toggles case. `⎈=` forces lowercase, `⎈⇧=` uppercase.
- [ ] Uppercase "make_me_upper"
- [ ] Lowercase "MAKE_ME_LOWER"
```md
make_me_upper
MAKE_ME_LOWER
```

## Code
### Indent
`⇥` indents the selection. `⇧⇥` unindents. Works across multiple selected lines at once.
- [ ] Fix the indentation of the code block
```ts
function hello() {
bla bla bla;
        bla bla;
    bla bla;
}
```

### Join & Clean
`⇧j` joins all selected lines into one.
`-` removes empty lines from the selection.
- [ ] Join the 3 fragmented lines into one
- [ ] Remove the empty lines from the block below
```md
This sentence is
spread across
three lines.

Block:
line one.

line two.

line three.
```

### Add Lines & Spaces
`↵` adds a blank line below the selection, `⇧↵` above.
`⎇␣` adds a space before, `⎇⇧␣` after.
No need to enter modify mode.
- [ ] Add a blank line after "ADD_BELOW"
- [ ] Add a space before "NOSPACE"
```md
ADD_BELOW
This is:NOSPACE
```

### Comment
`⇧c` toggles line comments on the selection.
- [ ] Comment the 3 lines
- [ ] Uncomment them
```ts
const x = 1;
const y = 2;
const z = 3;
```

### Format
`=` formats the selection using the language formatter.
With nothing selected, it formats the whole file.
- [ ] Format the broken code
```ts
function hello(    ){
const x=1
    const y =     2
return x+y}
```

### Fold
`z` toggles a fold at the cursor.
- [ ] Fold the function
- [ ] Unfold it
```ts
function bla() {
    bla bla bla;
    bla bla bla;
}
```

## Repetition
### Record & Replay
`⇧q` starts/stops recording a macro.
`q` replays your macro.
- [ ] Start recording a macro
- [ ] Enter modify mode at the line start
- [ ] Write "- "
- [ ] Exit modify mode
- [ ] Go down a line
- [ ] Repeat the macro 4 times
```md
item one
item two
item three
item four
item five
```

### Save & Load Macros
`⎈⇧q` saves the current macro to a named slot. `⎈q` loads one.
- [ ] Save your macro
- [ ] Load it
- [ ] Replay it on line 1
```md
item six
```

### Repeat & Count
`.` repeats the last modification (change, insert, append...).
Prefix any command with a number to run it that many times.
- [ ] Change "word" to "changed"
- [ ] Repeat that on line 2
- [ ] Move down 4 lines to skip the bla
```md
Change this word.
Change this word too using dot.
Bla bla bla.
Bla bla bla.
Bla bla bla.
Land here using 4j.
```

## Inspect
### Enter Inspect Mode
`␣` enters Inspect mode, which exposes LSP features.
`⎋` returns to move mode.
- [ ] Inspect x
```ts
const x = 1;
```

### Navigate
In Inspect mode:
`f` goes to definition/file.
`t` goes to type definition.
`z` goes to implementations.
`g` goes to references.
- [ ] Jump to the definition of myFunction
```ts
const result = myFunction();

function myFunction() {
    return 42;
}
```

### Diagnostics & Refactor
In Inspect mode:
`e`/`⇧e` jumps to next/previous diagnostic.
`␣` triggers Quick Fix.
`r` renames.
`y` copies the name.
- [ ] Navigate to the error
- [ ] Fix it
```ts
const x: number = "this is wrong";
```

## Scripting
### JS Pipe
`/` opens a prompt. `⎈/` opens a file with a run function.
Your JS expression runs on each selection (sel) and replaces it with the result.
You can see this happening live.
This lets you do advanced stuff like calculations and such.
- [ ] Select "hello world"
- [ ] Uppercase it with JavaScript ".toUpperCase"
```md
hello world
```

### JS Evaluate
`⇧/` evaluates the expression on all selections (sels) and shows the result in a notification.
`⎈⇧/` makes a JS file with the selection as a const.
Good for checks.
- [ ] Select "hello"
- [ ] Evaluate its length with JavaScript "sels[0].length"
```md
hello
```