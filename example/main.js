import Render from '../src/render.js'

async function main()
{
    const __1 = new Render()

    const block_ui = __1.block_ui({
        theme: 'dark',
        animation: 'orbs',
        count: 120,
        events: {
            screen_click: {
                destroy: true
            }
        }
    })


}

main()

