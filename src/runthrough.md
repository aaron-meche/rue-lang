# Run Through

Rue Programming Language
created by Aaron Meche

## How Rue Currently Works

.rue file that is inputting into RueFile compiler:

body {
    margin: 0
    background: red
}

.square {
    height: 4rem
    width: 4rem
    background: blue

    :hover {
        outline: solid 1pt red
    }
}

.css text outputted:

body {
    margin: 0;
    background: red;
}

.square {
    height: 4rem;
    width: 4rem;
    background: blue;
}

.square:hover {
    outline: solid 1pt red;
}