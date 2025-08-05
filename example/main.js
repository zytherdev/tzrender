import Render from '../src/render.js'

async function main()
{
    const __1 = new Render()
    const __2 = new Render()
    const __3 = new Render()

    const spinner = __1.spinner()

    console.log(spinner)

    setTimeout(() => {
        spinner.toggle(false)
    }, 5000)
}

main()

