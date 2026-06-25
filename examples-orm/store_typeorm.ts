import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';

@Entity()
export class Category {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
}

@Entity()
export class Product {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar' }) title: string;
  @Column() categoryId: number;
  @ManyToOne(() => Category) category: Category;
}
