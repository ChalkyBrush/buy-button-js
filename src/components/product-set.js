import merge from '../utils/merge';
import Component from '../component';
import Product from './product';
import Template from '../template';
import ProductSetUpdater from '../updaters/product-set';
import ProductSetView from '../views/product-set';
import normalizeConfig from '../utils/normalize-config';

function isArray(arg) {
  return Object.prototype.toString.call(arg) === '[object Array]';
}

/**
 * Renders and fetches data for collection and product set embed.
 * @extends Component.
 */

export default class ProductSet extends Component {

  /**
   * create ProductSet
   * @param {Object} config - configuration object.
   * @param {Object} props - data and utilities passed down from UI instance.
   */
  constructor(config, props) {
    if (Array.isArray(config.id)) {
      // eslint-disable-next-line no-param-reassign
      config = normalizeConfig(config);
    } else {
      // eslint-disable-next-line no-param-reassign
      config = normalizeConfig(config, 'Collection');
    }

    super(config, props);
    this.typeKey = 'productSet';
    this.products = [];
    this.cart = null;
    this.page = 1;
    this.nextModel = {products: []};
    this.updater = new ProductSetUpdater(this);
    this.view = new ProductSetView(this);
  }

  get nextButtonClass() {
    return this.nextModel.products.length ? 'is-active' : '';
  }

  /**
   * get data to be passed to view.
   * @return {Object} viewData object.
   */
  get viewData() {
    return Object.assign({}, this.options.viewData, {
      classes: this.classes,
      text: this.options.text,
      nextButtonClass: this.nextButtonClass,
    });
  }

  /**
   * get events to be bound to DOM.
   * @return {Object}
   */
  get DOMEvents() {
    return Object.assign({}, {
      click: this.props.closeCart.bind(this),
      [`click ${this.selectors.productSet.paginationButton}`]: this.nextPage.bind(this),
    }, this.options.DOMEvents);
  }

  /**
   * get template for rendering pagination button.
   * @return {Object} Template instance
   */
  get paginationTemplate() {
    this._paginationTemplate = this._paginationTemplate || new Template({pagination: this.options.templates.pagination}, {pagination: true}, ['pagination']);
    return this._paginationTemplate;
  }

  /**
   * get info about collection or set to be sent to tracker
   * @return {Object|Array}
   */
  get trackingInfo() {
    if (isArray(this.id)) {
      return this.model.products.map((product) => {
        return {
          id: product.id,
          name: product.selectedVariant.title,
          price: product.selectedVariant.price,
          sku: null,
        };
      });
    }
    return {
      id: this.id,
    };
  }

  /**
   * initializes component by creating model and rendering view.
   * Creates and initalizes cart if necessary.
   * Calls renderProducts.
   * @param {Object} [data] - data to initialize model with.
   * @return {Promise} promise resolving to instance.
   */
  init(data) {
    const cartConfig = Object.assign({}, this.globalConfig, {
      options: this.config,
    });

    return this.props.createCart(cartConfig).then((cart) => {
      this.cart = cart;
      return super.init.call(this, data).then((model) => {
        if (model) {
          return this.renderProducts(this.model.products);
        }
        return this;
      });
    });
  }

  /**
   * fetches products from SDK based on provided config information.
   * @param {Object} options - query options for request
   * @return {Promise} promise resolving to collection data.
   */
  sdkFetch() {
    let promise;

    if (this.storefrontId) {
      if (Array.isArray(this.storefrontId)) {
        promise = this.props.client.product.fetchMultiple(this.storefrontId);
      } else {
        promise = this.props.client.collection.fetchWithProducts(this.storefrontId);
      }
    } else if (this.handle) {
      promise = this.props.client.collection.fetchByHandle(this.handle).then((collection) => {
        this.storefrontId = collection.id;
        return this.props.client.collection.fetchWithProducts(this.storefrontId);
      });
    }
    return promise.then((collectionOrProducts) => {
      let products;
      if (Array.isArray(collectionOrProducts)) {
        products = collectionOrProducts;
      } else {
        products = collectionOrProducts.products;
      }
      return products;
    });
  }

  /**
   * call sdkFetch and set model.products to products array.
   * @throw 'Not Found' if model not returned.
   * @return {Promise} promise resolving to model data.
   */
  fetchData() {
    return this.sdkFetch().then((products) => {
      if (products.length) {
        return {
          products,
        };
      }
      throw new Error('Not Found');
    });
  }

  /**
   * make request to SDK for next page. Render button if products on next page exist.
   * @return {Promise} promise resolving when button is rendered or not.
   */
  showPagination() {
    return this.props.client.fetchNextPage(this.model.products).then((data) => {
      this.nextModel = {products: data.model};
      this.view.renderChild(this.classes.productSet.paginationButton, this.paginationTemplate);
      this.view.resize();
      return;
    });
  }

  /**
   * append next page worth of products into the DOM
   */
  nextPage() {
    this.model = this.nextModel;
    this._userEvent('loadNextPage');
    this.renderProducts();
  }

  /**
   * render product components into productSet container. Show pagination button if necessary.
   * @return {Promise} promise resolving to instance.
   */
  renderProducts() {
    if (!this.model.products.length) {
      return Promise.resolve();
    }
    const productConfig = Object.assign({}, this.globalConfig, {
      node: this.view.document.querySelector(`.${this.classes.productSet.products}`),
      options: merge({}, this.config, {
        product: {
          iframe: false,
          classes: {
            wrapper: this.classes.productSet.product,
          },
        },
      }),
    });

    const promises = this.model.products.map((productModel) => {
      const product = new Product(productConfig, this.props);
      this.products.push(product);
      return product.init(productModel);
    });

    return Promise.all(promises).then(() => {
      this.view.resizeUntilFits();
      this.showPagination();
      return this;
    });
  }
}
