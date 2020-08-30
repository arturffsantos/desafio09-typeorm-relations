import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import Product from '@modules/products/infra/typeorm/entities/Product';
import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  private ordersRepository: IOrdersRepository;

  private productsRepository: IProductsRepository;

  private customersRepository: ICustomersRepository;

  constructor(
    @inject('OrdersRepository') ordersRepository: IOrdersRepository,
    @inject('ProductsRepository') productsRepository: IProductsRepository,
    @inject('CustomersRepository') customersRepository: ICustomersRepository,
  ) {
    this.ordersRepository = ordersRepository;
    this.productsRepository = productsRepository;
    this.customersRepository = customersRepository;
  }

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) {
      throw new AppError('Could not find any customer with the given id');
    }

    const existentProducts: Product[] = await this.productsRepository.findAllById(
      products,
    );

    if (existentProducts.length === 0) {
      throw new AppError('Could not found any products with given ids');
    }

    const existentProductsIds = existentProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existentProductsIds.includes(product.id),
    );

    const checkInexistentProductsId = checkInexistentProducts.map(
      product => product.id,
    );

    if (checkInexistentProductsId.length > 0) {
      throw new AppError(
        `Could not find products with ids: ${JSON.stringify(
          checkInexistentProductsId,
        )}`,
      );
    }

    const findProductsWithNoQuantityAvailable = products.filter(
      product =>
        existentProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    if (findProductsWithNoQuantityAvailable.length > 0) {
      throw new AppError(
        `Products with quantity not available: ${JSON.stringify(
          findProductsWithNoQuantityAvailable,
        )}`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentProducts.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        existentProducts.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
