const StellarSdk = require('stellar-sdk')
import StellarAccounts from './StellarAccounts.js'
import StellarServer from './StellarServer.js'
import Helper from '../js/helper.js'
import {
  StellarWallet,
  LedgerAPI
} from 'stellar-js-utils'
import axios from 'axios'

class StellarUtils {
  constructor() {
    this.s = new StellarServer()

    this.vars = {}
  }

  server() {
    return this.s.server()
  }

  isTestnet() {
    return this.s.isTestnet()
  }

  lumins() {
    return StellarSdk.Asset.native()
  }

  assetFromObject(object) {
    if (!object.asset_issuer) {
      return StellarSdk.Asset.native()
    }

    return new StellarSdk.Asset(object.asset_code, object.asset_issuer)
  }

  api() {
    return this.s.serverAPI()
  }

  horizonMetrics() {
    return this.api().horizonMetrics()
  }

  accountInfo(publicKey) {
    return this.api().accountInfo(publicKey)
  }

  paths(sourcePublic, destinationPublic, destinationAsset, destinationAmount) {
    return this.api().paths(sourcePublic, destinationPublic, destinationAsset, destinationAmount).call()
  }

  balances(publicKey) {
    return this.api().balances(publicKey)
  }

  manageData(sourceWallet, fundingWallet, name, value) {
    return this.api().manageData(sourceWallet, fundingWallet, name, value)
  }

  mergeAccount(sourceWallet, destWallet) {
    return this.api().mergeAccount(sourceWallet, destWallet)
  }

  manageOffer(sourceWallet, fundingWallet, buying, selling, amount, price, offerID = 0) {
    return this.api().manageOffer(sourceWallet, fundingWallet, buying, selling, amount, price, offerID)
  }

  changeTrust(sourceWallet, fundingWallet, asset, amount) {
    return this.api().changeTrust(sourceWallet, fundingWallet, asset, amount)
  }

  allowTrust(sourceWallet, trustor, asset, authorize) {
    return this.api().allowTrust(sourceWallet, trustor, asset, authorize)
  }

  setDomain(sourceWallet, domain, fundingWallet = null) {
    return this.api().setDomain(sourceWallet, domain, fundingWallet)
  }

  // pass 1 for threshold if either account can sign for med/high operations
  makeMultiSig(sourceWallet, secondWallet, threshold) {
    return this.api().makeMultiSig(sourceWallet, secondWallet, threshold)
  }

  removeMultiSig(sourceWallet, secondWallet, transactionOpts) {
    return this.api().removeMultiSig(sourceWallet, secondWallet, transactionOpts)
  }

  // get the transaction for later submission
  removeMultiSigTransaction(sourceWallet, secondWallet, transactionOpts) {
    return this.api().removeMultiSigTransaction(sourceWallet, secondWallet, transactionOpts)
  }

  submitTransaction(transaction) {
    return this.api().submitTransaction(transaction)
  }

  // additionalSigners is an array of StellarWallet (ledger or secret key)
  sendAsset(sourceWallet, fundingWallet, destWallet, amount, asset = null, memo = null, additionalSigners = null) {
    return this.api().sendAsset(sourceWallet, fundingWallet, destWallet, amount, asset, memo, additionalSigners)
  }

  buyTokens(sourceWallet, sendAsset, destAsset, sendMax, destAmount) {
    return this.api().buyTokens(sourceWallet, sendAsset, destAsset, sendMax, destAmount)
  }

  lockAccount(sourceWallet, fundingWallet = null) {
    return this.api().lockAccount(sourceWallet, fundingWallet)
  }

  createAccount(sourceWallet, newWallet, startingBalance) {
    return this.api().createAccount(sourceWallet, newWallet, startingBalance)
  }

  setOptions(sourceWallet, options, fundingWallet = null) {
    return this.api().setOptions(sourceWallet, options, fundingWallet)
  }

  setFlags(sourceWallet, flags) {
    return this.api().setFlags(sourceWallet, flags)
  }

  clearFlags(sourceWallet, flags, fundingWallet = null) {
    return this.api().clearFlags(sourceWallet, flags, fundingWallet)
  }

  setInflationDestination(sourceWallet, inflationDest, fundingWallet = null) {
    return this.api().setInflationDestination(sourceWallet, inflationDest, fundingWallet)
  }

  // returns {account: newAccount, keypair: keypair}
  newAccount(sourceWallet, startingBalance, name = null, tag = null) {
    const keypair = StellarSdk.Keypair.random()

    Helper.debugLog('creating account...')
    Helper.debugLog(keypair.publicKey())
    Helper.debugLog(keypair.secret())

    const accountRec = StellarAccounts.addAccount(keypair, name, tag)

    return this.createAccount(sourceWallet, StellarWallet.secret(keypair.secret()), startingBalance)
      .then((account) => {
        return {
          account: account,
          keypair: keypair,
          accountRec: accountRec
        }
      })
      .catch((error) => {
        StellarAccounts.deleteAccount(keypair.publicKey())

        throw error
      })
  }

  // returns {account: newAccount, keypair: keypair}
  newAccountWithTokens(fundingWallet, distributorWallet, startingBalance, asset, amount, accountName = null, accountTag = null) {
    let info = null

    // problem if fundingWallet and distributorWallet is the same, fails for the sendAsset (too many signers)
    let newAccountFundingWallet = fundingWallet
    if (!newAccountFundingWallet) {
      newAccountFundingWallet = distributorWallet
    }

    return this.newAccount(newAccountFundingWallet, startingBalance, accountName, accountTag)
      .then((result) => {
        info = result

        // just make sure limit is at least > amount, but boosting it up just in case
        const trustLimit = Math.max(amount * 2, 100000)

        Helper.debugLog('setting trust...')
        return this.changeTrust(StellarWallet.secret(info.keypair.secret()), fundingWallet, asset, String(trustLimit))
      })
      .then((result) => {
        Helper.debugLog('sending tokens...')
        return this.sendAsset(distributorWallet, fundingWallet, StellarWallet.secret(info.keypair.secret()), amount, asset)
      })
      .then((result) => {
        Helper.debugLog(result, 'Success')
        this.updateBalances()

        return info
      })
  }

  displayLedgerInfo() {
    const fundingWallet = StellarWallet.ledger(new LedgerAPI())
    fundingWallet.publicKey()
      .then((publicKey) => {
        return this.api().accountInfo(publicKey)
      })
      .then((info) => {
        Helper.debugLog(info)
      })
      .catch((error) => {
        Helper.debugLog(error, 'Error')
        Helper.toast('Error', true)
      })
  }

  sendTestnetXLMToLedger() {
    Helper.debugLog('refilling ledger...')

    const fundingWallet = StellarWallet.ledger(new LedgerAPI(), () => {
      Helper.toast('Confirm transaction on Ledger Nano')
    })

    let ledgerPublicKey

    fundingWallet.publicKey()
      .then((publicKey) => {
        ledgerPublicKey = publicKey

        return this.accountInfo(publicKey)
      })
      .then((account) => {
        // account exists, so friendbot will just fail, do the merge
        const keyPair = StellarSdk.Keypair.random()

        const url = 'https://friendbot.stellar.org' + '?addr=' + keyPair.publicKey()
        return axios.get(url)
          .then((data) => {
            Helper.debugLog(data, 'Success')

            return this.mergeAccount(StellarWallet.secret(keyPair.secret()), fundingWallet)
          })
          .then(() => {
            Helper.toast('Testnet XLM added to your Ledger!')
          })
          .catch((err) => {
            Helper.debugLog(err, 'Error')
            Helper.toast('Error!', true)
          })
      })
      .catch(() => {
        Helper.debugLog('Account doesn\'t exist, asking friendbot for help.')

        // account doesn't exist, so ask friendbot to create it
        const url = 'https://friendbot.stellar.org' + '?addr=' + ledgerPublicKey
        return axios.get(url)
      })
      .then((info) => {
        Helper.debugLog(info)
        Helper.toast('Testnet XLM added to your Ledger!')
      })
  }

  // Public Key    GBW74UVOXKGHO3WX6AV5ZGTB4JYBKCEJOUQAUSI25NRO3PKY5BC7WYZS
  // Secret Key    SA3W53XXG64ITFFIYQSBIJDG26LMXYRIMEVMNQMFAQJOYCZACCYBA34L

  // SDNWCD4F63WBLU3E2QANDMVR3KLW6D5KBBENQSLSGC62X3PCHFMZQWHU
  // GCFJ3JX6P5UZFABESJRZXNN2TH4UV67RGD5ECNTDUGPMIRQTFABXWWXV

  doCreateTestAccount(name = null) {
    const sourceWallet = StellarWallet.secret('SDNWCD4F63WBLU3E2QANDMVR3KLW6D5KBBENQSLSGC62X3PCHFMZQWHU')
    return this.newAccount(sourceWallet, '1000', name)
      .then((result) => {
        this.updateBalances()
        Helper.debugLog(result.account, 'Success')

        return result.accountRec
      })
      .catch((error) => {
        Helper.debugLog(error, 'Error')

        // failed, try friendbot as a backup
        return this.createTestAccountFriendBot(name)
      })
  }

  createTestAccount(name = null) {
    // we need this to run synchronously so that sequence numbers don't get out of sync
    if (!this.vars.syncPromise) {
      this.vars.syncPromise = Promise.resolve()
    }

    const result = this.vars.syncPromise.then(() => {
      return this.doCreateTestAccount(name)
    })

    this.vars.syncPromise = result

    return result
  }

  createTestAccountFriendBot(name = null) {
    const keyPair = StellarSdk.Keypair.random()
    const accountRec = StellarAccounts.addAccount(keyPair, name)

    const url = 'https://friendbot.stellar.org' + '?addr=' + keyPair.publicKey()
    return axios.get(url)
      .then((info) => {
        Helper.debugLog(info, 'Success')

        this.updateBalances()

        return accountRec
      })
      .catch((error) => {
        Helper.debugLog(error, 'Error')

        Helper.toast('Friendbot must be down again!', true)

        // delete the account friend bot failed
        StellarAccounts.deleteAccount(accountRec.publicKey)

        throw error
      })
  }

  updateBalances(logSuccess = false) {
    for (const acct of StellarAccounts.accountsForNetwork()) {
      const publicKey = acct.publicKey

      this.balances(publicKey)
        .then((balanceObject) => {
          let removeAll = true

          for (const key in balanceObject) {
            StellarAccounts.updateBalance(publicKey, key, balanceObject[key], removeAll)
            removeAll = false
          }

          if (logSuccess) {
            Helper.debugLog(publicKey, 'Success')
          }

          return null
        })
        .catch((error) => {
          StellarAccounts.updateBalance(publicKey, 'XLM', 'ERROR')

          Helper.debugLog(error, 'Error')
        })
    }
  }

  operationsForWallet(wallet, order = 'desc') {
    wallet.publicKey()
      .then((publicKey) => {
        this.server().operations()
          .forAccount(publicKey)
          .order(order)
          .call()
          .then((response) => {
            Helper.debugLog(response)
          })
      })
      .catch((error) => {
        Helper.debugLog(error, 'Error')
        Helper.toast('Error', true)
      })
  }

  paymentsForWallet(wallet, order = 'desc') {
    wallet.publicKey()
      .then((publicKey) => {
        this.server().payments()
          .forAccount(publicKey)
          .order(order)
          .call()
          .then((response) => {
            Helper.debugLog(response)
          })
      })
      .catch((error) => {
        Helper.debugLog(error, 'Error')
        Helper.toast('Error', true)
      })
  }

  transactionsForWallet(wallet, order = 'desc') {
    wallet.publicKey()
      .then((publicKey) => {
        this.server().transactions()
          .forAccount(publicKey)
          .order(order)
          .call()
          .then((response) => {
            Helper.debugLog(response)
          })
      })
      .catch((error) => {
        Helper.debugLog(error, 'Error')
        Helper.toast('Error', true)
      })
  }
}

const instance = new StellarUtils()
Object.freeze(instance)

export default instance