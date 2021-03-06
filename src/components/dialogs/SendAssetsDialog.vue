<template>
<v-dialog lazy v-model='visible' scrollable @keydown.esc="visible = false" max-width="600">
  <div class='main-container'>
    <dialog-titlebar :title=title v-on:close='visible = false' />

    <div class='help-contents'>
      <div class='help-text'>
        <div>Send a payment to the destination account.</div>
      </div>

      <div class='help-email'>
        <dialog-accounts ref='dialogAccounts' v-on:toast='displayToast' v-on:enter-key-down='sendXLM' :showSource=true :showDest=true :showAmount=true :showSigner=true :showAsset=true />
      </div>
      <div class='button-holder'>
        <v-tooltip open-delay='200' bottom>
          <v-btn round color='primary' slot="activator" @click="sendXLM()" :loading="loading">Send Payment</v-btn>
          <span>Send the payment</span>
        </v-tooltip>
      </div>

      <toast-component :absolute=true location='send-assets-dialog' :bottom=false :top=true />
    </div>
  </div>
</v-dialog>
</template>

<script>
import Helper from '../../js/helper.js'
import {
  DialogTitleBar
} from 'stellar-js-utils'
import StellarUtils from '../../js/StellarUtils.js'
import ToastComponent from '../ToastComponent.vue'
import DialogAccountsView from './DialogAccountsView.vue'

export default {
  props: ['ping'],
  components: {
    'dialog-titlebar': DialogTitleBar,
    'toast-component': ToastComponent,
    'dialog-accounts': DialogAccountsView
  },
  data() {
    return {
      visible: false,
      title: 'Send XLM',
      loading: false
    }
  },
  watch: {
    ping: function() {
      this.visible = true

      if (this.dialogAccounts()) {
        this.dialogAccounts().resetState()
      }

      // autofocus hack
      this.$nextTick(() => {
        if (this.$refs.input) {
          this.$refs.input.focus()
        }
      })
    }
  },
  methods: {
    dialogAccounts() {
      return this.$refs.dialogAccounts
    },
    sendXLM() {
      const sourceWallet = this.dialogAccounts().sourceWallet()
      const destWallet = this.dialogAccounts().destWallet()
      const amount = this.dialogAccounts().amount()

      if (sourceWallet && destWallet && amount > 0) {
        Helper.debugLog('Sending XLM...')
        this.loading = true

        let additionalSigners = null
        const signerWallet = this.dialogAccounts().signerWallet()
        if (signerWallet) {
          additionalSigners = [signerWallet]
        }

        const asset = this.dialogAccounts().asset()

        StellarUtils.sendAsset(sourceWallet, null, destWallet, String(amount), asset, null, additionalSigners)
          .then((result) => {
            Helper.debugLog(result)
            this.loading = false

            StellarUtils.updateBalances()

            this.displayToast('Success!')
            return null
          })
          .catch((error) => {
            Helper.debugLog(error, 'Error')
            this.loading = false
            this.displayToast('Error!', true)
          })
      }
    },
    displayToast(message, error = false) {
      Helper.toast(message, error, 'send-assets-dialog')
    }
  }
}
</script>

<style lang='scss' scoped>
@import '../../scss/styles.scss';

.main-container {
    @include standard-dialog-contents();

    .help-contents {
        @include inner-dialog-contents();

        .help-text {
            div {
                margin-bottom: 10px;
            }
            margin-bottom: 20px;

            .sub-header {
                font-size: 0.8em;
            }
        }

        .help-email {
            margin: 0 30px 16px;
        }
    }
}
</style>
