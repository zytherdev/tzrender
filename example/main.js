import Render from '../src/render.js'

async function main()
{
    const __1 = new Render()
    const __2 = new Render()
    const __3 = new Render()

    const spinner = __1.spinner(
        {
            events: {
                screen_click: {
                    destroy: true
                }
            }
        }
    )
}

main()

