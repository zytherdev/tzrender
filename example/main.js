import Render from '../src/render.js'

async function main()
{
    const __1 = new Render()

    __1.msg_box({
        theme: 'dark',
        title: 'Techz-render',
        msg: 'Welcome to Techz-render!',
        action: {
            cancel: {
                text: 'Cancel',
                callback: () => {
                    __1.alert({
                        theme: 'light',
                        msg: 'You canceled the message box',
                        variant: 'warning',
                        timeout: 1000
                    })
                }
            },
            confirm: {
                text: 'Confirm',
                callback: () => {
                    __1.alert({
                        theme: 'light',
                        msg: 'You confirmed the message box',
                        variant: 'success',
                        timeout: 1000
                    })
                }
            }
        }
    })

    __1.alert()
    
}

main()

