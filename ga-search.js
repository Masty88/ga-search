import {LitElement, html} from 'lit';
import Autocomplete from '@trevoreyre/autocomplete-js';
import Storage from './storage';

const baseUrl = 'https://www.sigip.ch/search';
const searchUrl = baseUrl + '?limit={limit}&partitionlimit={partitionlimit}&interface={interface}&query={input}&lang={lang}';
const defaultLimit = 30;
const defaultPartitionLimit = 5;
const defaultInterface = 'desktop';

class GeoadminSearch extends LitElement {

  static get properties() {
    return {
      minlength: {type: Number},
      limit: {type: Number},
      debounceTime: {type: Number},
      lang: {type: String},
      types: {type: String},
      sr: {type: String},
      featureLayers: {type: String},
      filterResults: {type: Object},
      renderResult: {type: Object},
      additionalSource: {type: Object},
      storage: {type: Object},
      historyEnabled: {type: Boolean}
    };
  }

  constructor() {
    super();

    this.minlength = 1;
    this.limit = 15;
    this.debounceTime = 200;
    this.types = 'location';
    this.sr = '4326';
    this.filterResults = undefined;
    this.renderResult = undefined;
    this.additionalSource = undefined;
    this.historyEnabled = true;
    this.storage = new Storage();
    this.storage.setLimit(10);
  }

  slotReady() {
    this.autocomplete = new Autocomplete(this, {
      debounceTime: this.debounceTime,

      search: input => {
        return new Promise(resolve => {
          if (input.length < this.minlength && this.historyEnabled) {
            const history = this.storage.getHistory();
            if (input.length === 0) {
              resolve(history);
            } else {
              const filteredResults = history.filter(item => {
                return item.properties.label.toLowerCase().indexOf(input.toLowerCase()) > -1;
              });
              resolve(filteredResults);
            }
          }
          const sigipUrl = searchUrl
            .replace('{input}', encodeURIComponent(input))
            .replace('{limit}', this.limit || defaultLimit)
            .replace('{partitionlimit}', defaultPartitionLimit)
            .replace('{interface}', defaultInterface)
            .replace('{lang}', getLang(this.lang || document.documentElement.lang));

          const sigipPromise = fetch(sigipUrl)
            .then(response => {
              if (!response.ok) {
                throw new Error('Errore di rete');
              }
              return response.json();
            }).then(data => data.features);

          const promises = [sigipPromise];


          Promise.all(promises)
            .then(results => {
              let combinedResults = results.flat();
              if (this.filterResults) {
                combinedResults = combinedResults.filter(this.filterResults);
              }
              resolve(combinedResults);
            })
            .catch(error => {
              console.error('Errore nella ricerca combinata:', error);
              resolve([]);
            });
        });
      },


      renderResult: (result, props) => {
        // Match input value except if the string is inside an HTML tag.
        const pattern = `${escapeRegExp(this.autocomplete.input.value)}(?![^<>]*>)`;
        const regexp = new RegExp(pattern, 'ig');

        const label = this.getLabelFromResult(result).replace(regexp, match => `<span class='highlight'>${match}</span>`);
        return `
          <li ${props}>
            ${this.renderResult ? this.renderResult(result, label) : label}
          </li>
        `;
      },

      getResultValue: result => {
        return this.getLabelFromResult(result).replace(/<i>.*<\/i>/g, '').replace(/<\/?b>/g, '');
      },

      onSubmit: result => {
        if (result) {
          this.dispatchEvent(new CustomEvent('submit', {
            bubbles: true,
            composed: true,
            detail: {
              result: result.type === 'additionalSource' ? result.result : result
            }
          }));
          if (this.historyEnabled) {
            // store selected result in history if history is enabled
            result._key = this.getLabelFromResult(result);
            this.storage.addEntry(result);
          }
        }
      }
    });
  }

  getLabelFromResult(result) {
    if (result.type === 'additionalSource') {
      return this.additionalSource.getResultValue(result.result);
    } else {
      return result.properties.label;
    }
  }

  render() {
    return html`
      <slot @slotchange="${this.slotReady}"></slot>
    `;
  }
}

function escapeRegExp(string) {
  return string ? string.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') : string;
}

// extract the language value and discard the country code (eg. 'fr-CH')
function getLang(string) {
  return string.split('-')[0];
}


customElements.define('ga-search', GeoadminSearch);
