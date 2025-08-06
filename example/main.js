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
            },
            variant: 'simple',
            custom: {
                animation: 'spin'
            }
        }
    )

    spinner.toggle(false)

    __1.block_ui()
}

main()

