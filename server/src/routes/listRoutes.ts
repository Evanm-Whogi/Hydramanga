import express, { RequestHandler } from 'express';
import { 
    getUserLists, 
    createList, 
    updateList, 
    deleteList, 
    getListItems, 
    addToList, 
    removeFromList,
    reorderLists 
} from '@/controllers/listController';
import { listWriteRateLimit } from '@/middlewares/userActionRateLimit';

const router = express.Router();

// Get all user lists
router.get('/', getUserLists as RequestHandler);

// Create a new list
router.post('/', listWriteRateLimit, createList as RequestHandler);

// Reorder lists
router.post('/reorder', listWriteRateLimit, reorderLists as RequestHandler);

// Remove manga from any list (before /:id routes to avoid matching as ID)
router.delete('/items', listWriteRateLimit, removeFromList as RequestHandler);

// Get items in a specific list
router.get('/:id', getListItems as RequestHandler);

// Update a list (name, visibility, sort order)
router.put('/:id', listWriteRateLimit, updateList as RequestHandler);

// Delete a list
router.delete('/:id', listWriteRateLimit, deleteList as RequestHandler);

// Add manga to a specific list
router.post('/:id/items', listWriteRateLimit, addToList as RequestHandler);

export default router;
